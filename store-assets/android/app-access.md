# Play reviewer app access

ChessPerfect contains authenticated and academy-specific functionality. Create durable reviewer accounts in **Production** that do not require OTP, email access or payment.

## Player reviewer account

- Username: `PLAY_CONSOLE_REVIEWER_PLAYER`
- Password: store only in Play Console app-access instructions
- Access: player dashboard, multiplayer lobby, bot play, puzzles, analysis board, board editor and My Account

## Student reviewer account

- Username: `PLAY_CONSOLE_REVIEWER_STUDENT`
- Password: store only in Play Console app-access instructions
- Academy: a permanent review academy with study library, fee history, attendance and at least one upcoming sample class

## Coach reviewer account

- Username: `PLAY_CONSOLE_REVIEWER_COACH`
- Password: store only in Play Console app-access instructions
- Academy: same review academy, with a batch and upcoming sample class available

## Reviewer instructions

1. Open the app and tap **Sign in**.
2. Use one of the credentials supplied in the Play Console.
3. Player features are available from **Play**, **Learn** and **My Account**.
4. Academy features are available from **My Academy**. Use the Student or Coach account for role-specific pages.
5. Google Play Billing products are visible only in Play-installed builds and with products active in this application.

Never commit real passwords to this repository. Replace the placeholders only inside the secure Play Console form.
