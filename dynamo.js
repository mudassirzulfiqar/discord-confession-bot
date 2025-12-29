import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand
} from "@aws-sdk/lib-dynamodb";
import { config } from "./config.js";

const client = new DynamoDBClient({ region: config.awsRegion });
const ddb = DynamoDBDocumentClient.from(client);

/**
 * Save per-server configuration
 */
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

/**
 * Save a confession
 */
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

/**
 * Pending confession (multi-server selection)
 */
export async function savePendingConfession({
  hashedUserId,
  message,
  servers
}) {
  const ttl = Math.floor(Date.now() / 1000) + 300; // 5 minutes

  await ddb.send(
    new PutCommand({
      TableName: config.dynamoTableName,
      Item: {
        PK: `USER#${hashedUserId}`,
        SK: "PENDING_CONFESSION",
        message,
        servers,
        ttl
      }
    })
  );
}

export async function getPendingConfession(hashedUserId) {
  const res = await ddb.send(
    new GetCommand({
      TableName: config.dynamoTableName,
      Key: {
        PK: `USER#${hashedUserId}`,
        SK: "PENDING_CONFESSION"
      }
    })
  );

  return res.Item || null;
}

export async function deletePendingConfession(hashedUserId) {
  await ddb.send(
    new DeleteCommand({
      TableName: config.dynamoTableName,
      Key: {
        PK: `USER#${hashedUserId}`,
        SK: "PENDING_CONFESSION"
      }
    })
  );
}