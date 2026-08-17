import { google } from "googleapis";

import { prisma } from "@/lib/prisma";

async function getDriveClientForUser(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) {
    throw new Error(
      "Googleアカウントが連携されていません。再ログインしてください。"
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  const isExpired =
    !account.expires_at || account.expires_at * 1000 < Date.now();

  if (isExpired) {
    if (!account.refresh_token) {
      throw new Error(
        "リフレッシュトークンがありません。再ログインしてください。"
      );
    }
    oauth2Client.setCredentials({ refresh_token: account.refresh_token });
    const { credentials } = await oauth2Client.refreshAccessToken();

    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date
          ? Math.floor(credentials.expiry_date / 1000)
          : null,
      },
    });

    oauth2Client.setCredentials(credentials);
  } else {
    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    });
  }

  return google.drive({ version: "v3", auth: oauth2Client });
}

export async function uploadJsonToDrive(
  userId: string,
  fileName: string,
  jsonData: unknown
) {
  const drive = await getDriveClientForUser(userId);
  const folderId = process.env.GDRIVE_FOLDER_ID;

  await drive.files.create({
    requestBody: {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType: "application/json",
      body: JSON.stringify(jsonData, null, 2),
    },
  });
}
