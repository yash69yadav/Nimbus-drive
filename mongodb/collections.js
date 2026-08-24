export async function ensureMongoIndexes(database) {
  await Promise.all([
    database.collection('users').createIndex({ email: 1 }, { unique: true }),
    database.collection('folders').createIndex({ ownerId: 1, parentId: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } }),
    database.collection('folders').createIndex({ ownerId: 1, parentId: 1, isDeleted: 1 }),
    database.collection('files').createIndex({ ownerId: 1, folderId: 1, isDeleted: 1, updatedAt: -1 }),
    database.collection('files').createIndex({ ownerId: 1, name: 'text' }),
    database.collection('file_versions').createIndex({ fileId: 1, versionNumber: -1 }),
    database.collection('shares').createIndex({ resourceType: 1, resourceId: 1, granteeUserId: 1 }, { unique: true }),
    database.collection('shares').createIndex({ granteeUserId: 1, createdAt: -1 }),
    database.collection('linkShares').createIndex({ token: 1 }, { unique: true }),
    database.collection('linkShares').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection('stars').createIndex({ userId: 1, resourceType: 1, resourceId: 1 }, { unique: true }),
    database.collection('activities').createIndex({ resourceId: 1, createdAt: -1 }),
    database.collection('activities').createIndex({ actorId: 1, createdAt: -1 })
  ]);
}
