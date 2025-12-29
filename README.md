\# Discord Anonymous Confession Bot

Anonymous confessions via DM, posted into a configured channel per server. Uses a single DynamoDB table for server configuration + confession records.

\#\# What this bot does
- Users DM the bot with `confess: <message>`.
- If the user is in exactly 1 configured server, the confession is posted there.
- If the user is in multiple configured servers, the bot replies with buttons to choose the server.
- Server admins run `/setconfession` in the channel where confessions should be posted.

\#\# Tech / requirements
- Node.js (recommended: Node 18+)
- A Discord application + bot token
- AWS DynamoDB table (single-table design)
- AWS credentials (local) or an IAM role (EC2)

\#\# 1) Create the Discord bot application
1. Open the Discord Developer Portal: https://discord.com/developers/applications
2. Click **New Application** → give it a name → **Create**.
3. Go to **Bot** (left sidebar) → **Add Bot**.
4. Copy the **Token** (this becomes `DISCORD_TOKEN`).
5. In the **Bot** page, enable the intent(s) this bot uses:
	- **Message Content Intent** (the bot reads DM message text in `messageCreate`)
6. (Optional but recommended) Turn off **Public Bot** until you finish testing.

\#\# 2) Get the IDs you need (Client ID, Server ID, Channel ID)

\#\#\# A) Get the Application / Client ID
1. In the Developer Portal, open your application.
2. Go to **General Information**.
3. Copy **Application ID** (this is commonly referred to as the Client ID).

You’ll use it as:
- `CLIENT_ID` when registering slash commands (`npm run register`)
- `client_id` in the invite URL

\#\#\# B) Enable Developer Mode in Discord (to copy IDs)
1. Open Discord → **User Settings**.
2. Go to **Advanced**.
3. Enable **Developer Mode**.

Now you can right-click things and copy IDs:
- **Server (Guild) ID**: right-click the server icon → **Copy Server ID**
- **Channel ID**: right-click the channel → **Copy Channel ID**
- **User ID**: right-click a user → **Copy User ID**

\#\# 3) Create the bot invite link (and “paste it”)

You can generate an invite link in two ways.

\#\#\# Option A (recommended): OAuth2 URL Generator
1. Developer Portal → **OAuth2** → **URL Generator**
2. Scopes:
	- `bot`
	- `applications.commands`
3. Bot Permissions (minimum recommended for this bot):
	- View Channels
	- Send Messages
	- Embed Links
	- Read Message History
4. Copy the generated URL.
5. Paste it into your browser, choose the server, and authorize.

\#\#\# Option B: Manually build the invite URL
Replace `YOUR_CLIENT_ID` and paste this into a browser:

`https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=84992`

Notes:
- The `permissions=84992` value corresponds to: View Channels + Send Messages + Embed Links + Read Message History.
- You can also set `permissions=0` and manage permissions via roles, but the bot still needs to be able to post messages + embeds in the configured channel.

\#\# 4) Create the DynamoDB table

This project uses a *single* DynamoDB table with these keys:
- Partition key: `PK` (String)
- Sort key: `SK` (String)

It also stores:
- server config items under: `PK = SERVER#<guildId>`, `SK = CONFIG`
- confessions under: `PK = SERVER#<guildId>`, `SK = CONFESSION#<timestamp>#<uuid>`
- pending multi-server selection under: `PK = USER#<sha256(userId)>`, `SK = PENDING_CONFESSION`

Enable DynamoDB TTL on attribute `ttl` (used for pending confessions; default expiration ~5 minutes).

\#\#\# Example AWS CLI (optional)
If you use the AWS CLI, this creates a pay-per-request table:

```zsh
aws dynamodb create-table \
  --table-name YOUR_TABLE_NAME \
  --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
  --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

aws dynamodb update-time-to-live \
  --table-name YOUR_TABLE_NAME \
  --time-to-live-specification Enabled=true,AttributeName=ttl
```

\#\# 5) Configure environment variables

This project reads config from environment variables in `config.js`.

Required:
- `DISCORD_TOKEN` (Bot token)
- `DDB_TABLE` (DynamoDB table name)
- `AWS_REGION` (defaults to `us-east-1` if not set)

Also required for slash command registration:
- `CLIENT_ID` (Application ID)

Example for macOS zsh (current shell session):

```zsh
export DISCORD_TOKEN="YOUR_DISCORD_BOT_TOKEN"
export DDB_TABLE="YOUR_DYNAMODB_TABLE_NAME"
export AWS_REGION="us-east-1"
export CLIENT_ID="YOUR_APPLICATION_ID"
```

AWS credentials:
- Local dev: ensure your AWS credentials are available (e.g. `aws configure`, or env vars like `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`).
- EC2: prefer attaching an IAM role that can read/write to your DynamoDB table.

\#\# 6) Install and run

```zsh
npm install
```

Register slash commands (global):

```zsh
npm run register
```

Run the bot:

```zsh
npm start
```

Notes on slash commands:
- This code registers global commands via `Routes.applicationCommands(...)`.
- Global command updates can take a bit to appear across Discord. If you’re testing and don’t see `/setconfession` right away, wait a little and try again.

\#\# 7) Configure a server (admin step)
1. Invite the bot to your server.
2. Go to the channel where you want confessions to be posted.
3. Run the slash command:
	- `/setconfession`

This stores the channel ID for that server in DynamoDB.

\#\# Using the bot (end users)

\#\#\# Send a confession (DM)
DM the bot using this exact format:

- `confess: your message here`

What happens next:
- If only 1 of your servers has confessions enabled, the bot posts it there immediately.
- If multiple servers have confessions enabled *and* you are a member of them, the bot shows buttons so you can pick which server to post to.

\#\# Commands available

\#\#\# `/setconfession`
- Purpose: Set the confession channel for the current server.
- Where to run: In the channel you want confessions posted to.
- Permissions: Admin-only (enforced by Discord permissions + runtime check).
- Output: An ephemeral confirmation like `Confession channel set to #channel`.

\#\#\# DM message command: `confess:`
- Purpose: Submit an anonymous confession.
- Where to run: In a DM to the bot.
- Format: `confess: <message>`
- Notes:
  - If you forget the format, the bot replies with: `Use format: confess: your message here`.
  - Confessions are posted as an embed titled “Anonymous Confession”.

\#\# Troubleshooting
- Missing env var error: ensure `DISCORD_TOKEN`, `DDB_TABLE`, and `AWS_REGION` (or let it default) are set before starting.
- `npm run register` fails: confirm `DISCORD_TOKEN` and `CLIENT_ID` are set in the same shell session.
- Bot doesn’t see your DM content: ensure **Message Content Intent** is enabled in the Developer Portal.
- “No server has confessions enabled.”: an admin must run `/setconfession` in at least one server channel.