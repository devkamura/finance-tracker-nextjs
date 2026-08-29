// メールアドレスの前後空白除去・小文字化。
// 招待時の入力とGoogleログイン時のメールアドレスを同一基準で突き合わせるため、
// DB側(_link_group_membership関数)と同じ正規化ルールをアプリ側でも用いる。
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string[] {
  const errors: string[] = [];
  const normalized = normalizeEmail(email);

  if (!normalized) {
    errors.push("メールアドレスを入力してください。");
  } else if (!EMAIL_PATTERN.test(normalized)) {
    errors.push("メールアドレスの形式が正しくありません。");
  }

  return errors;
}
