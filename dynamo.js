import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand
} from "@aws-sdk/lib-dynamodb";
import { config } from "./config.js";

const client = new DynamoDBClient({ region: config.awsRegion });
const ddb = DynamoDBDocumentClient.from(client);

export async function saveServerConfig(serverId, channelId) {
  await ddb.send(
    new PutCommand({
      TableName: config.dynamoTableName,
      Item: {
        PK: `SERVER#${serverId}`,
        SK: "CONFIG",
        entityType: "SERVER",
        confessionChannelId: channelId,
        createdAt: new Date().toISOString()
      }
    })
  );
}

export async function getServerConfig(serverId) {
  const res = await ddb.send(
    new GetCommand({
      TableName: config.dynamoTableName,
      Key: {
        PK: `SERVER#${serverId}`,
        SK: "CONFIG"
      }
    })
  );

  return res.Item || null;
}

export async function saveConfession({
  serverId,
  channelId,
  confessionId,
  message
}) {
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: config.dynamoTableName,
      Item: {
        PK: `SERVER#${serverId}`,
        SK: `CONFESSION#${now}#${confessionId}`,
        entityType: "CONFESSION",
        serverId,
        channelId,
        confessionId,
        message,
        status: "ACTIVE",
        createdAt: now
      }
    })
  );
}