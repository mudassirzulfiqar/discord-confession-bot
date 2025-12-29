export const config = {
  discordToken: process.env.DISCORD_TOKEN,
  dynamoTableName: process.env.DDB_TABLE,
  awsRegion: process.env.AWS_REGION || "us-east-1"
};

for (const [key, value] of Object.entries(config)) {
  if (!value) {
    throw new Error(`❌ Missing environment variable: ${key}`);
  }
}