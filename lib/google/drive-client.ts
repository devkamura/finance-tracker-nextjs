import { google } from "googleapis";

import { getGoogleTokens, updateGoogleAccessToken } from "@/lib/google/tokens";

async function getDriveClientForUser(userId: string) {
  const tokenRow = await getGoogleTokens(userId);
  if (!tokenRow) {
    throw new Error(
      "Googleアカウントが連携されていません。再ログインしてください。"
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  // 60秒のバッファを持たせ、期限直前でのAPI呼び出し失敗を避ける。
  const isExpired =
    new Date(tokenRow.expires_at).getTime() - 60_000 < Date.now();

  if (isExpired) {
    if (!tokenRow.refresh_token) {
      throw new Error(
        "リフレッシュトークンがありません。再ログインしてください。"
      );
    }
    oauth2Client.setCredentials({ refresh_token: tokenRow.refresh_token });
    const { credentials } = await oauth2Client.refreshAccessToken();

    await updateGoogleAccessToken(userId, {
      accessToken: credentials.access_token!,
      expiresAt: credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600 * 1000),
    });

    oauth2Client.setCredentials(credentials);
  } else {
    oauth2Client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
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
