import express from 'express';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { ensureMongoIndexes } from './mongodb/collections.js';

loadEnvFile();
const app = express();
const port = Number(process.env.PORT || 4173);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'nimbus_drive';
const jwtSecret = process.env.JWT_SECRET || 'local-development-secret-change-before-production';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
let client;
let database;
let bucket;

const otpStore = new Map(); // phone -> { otp, name, expiresAt }

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

// CORS - Allow all origins for development and local tools
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Link-Password');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

function loadEnvFile() {
  try {
    if (!existsSync('.env')) return;
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

function apiError(res, status, code, message) { return res.status(status).json({ error: { code, message } }); }
function asId(value) { return ObjectId.isValid(value) ? new ObjectId(value) : null; }
function publicUser(user) { return { id: user._id.toString(), email: user.email, name: user.name, phone: user.phone || null, imageUrl: user.imageUrl || null, createdAt: user.createdAt }; }
function publicItem(item, isStarred = false) {
  return {
    id: item._id.toString(),
    type: item.type || 'file',
    name: item.name,
    mimeType: item.mimeType || null,
    sizeBytes: item.sizeBytes || 0,
    ownerId: item.ownerId.toString(),
    folderId: item.folderId?.toString() || null,
    parentId: item.parentId?.toString() || null,
    versionNumber: item.versionNumber || 1,
    starred: isStarred || Boolean(item.starred),
    isDeleted: Boolean(item.isDeleted),
    deletedAt: item.deletedAt || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}
function parseCookies(header = '') { return Object.fromEntries(header.split(';').map((value) => value.trim().split('=').map(decodeURIComponent)).filter(([key]) => key)); }
function tokenFor(user) { return jwt.sign({ sub: user._id.toString(), email: user.email }, jwtSecret, { expiresIn: '7d' }); }
function setSession(res, user) { res.cookie('nimbus_token', tokenFor(user), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' }); }
function validName(value, limit = 255) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit && !/[\\/\0]/.test(value); }
function needDatabase(req, res, next) { if (!database) return apiError(res, 503, 'DATABASE_UNAVAILABLE', 'Configure MONGODB_URI to enable the MongoDB API.'); return next(); }
function requireAuth(req, res, next) {
  const token = parseCookies(req.headers.cookie).nimbus_token || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return apiError(res, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
  try { req.auth = jwt.verify(token, jwtSecret); return next(); }
  catch { return apiError(res, 401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.'); }
}
function ownerId(req) { return new ObjectId(req.auth.sub); }

async function logActivity(actorId, action, resourceType, resourceId, context = {}) {
  if (!database) return;
  try {
    await database.collection('activities').insertOne({
      actorId,
      action,
      resourceType,
      resourceId: asId(resourceId) || resourceId,
      context,
      createdAt: new Date()
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

async function findResource(resourceType, resourceId) {
  const id = asId(resourceId);
  if (!id || !['file', 'folder'].includes(resourceType)) return null;
  return database.collection(resourceType === 'file' ? 'files' : 'folders').findOne({ _id: id });
}

async function permissionFor(userId, resourceType, resource, write = false) {
  if (resource.ownerId.equals(userId)) return 'owner';
  const direct = await database.collection('shares').findOne({ resourceType, resourceId: resource._id, granteeUserId: userId });
  if (direct && (!write || direct.role === 'editor')) return direct.role;
  if (resourceType === 'file' && resource.folderId) {
    const inherited = await database.collection('shares').findOne({ resourceType: 'folder', resourceId: resource.folderId, granteeUserId: userId });
    if (inherited && (!write || inherited.role === 'editor')) return inherited.role;
  }
  return null;
}

async function requireResourceAccess(req, res, resourceType, resourceId, write = false) {
  const resource = await findResource(resourceType, resourceId);
  if (!resource || resource.isDeleted) { apiError(res, 404, 'NOT_FOUND', 'The requested resource does not exist.'); return null; }
  const role = await permissionFor(ownerId(req), resourceType, resource, write);
  if (!role) { apiError(res, 403, 'FORBIDDEN', 'You do not have access to this resource.'); return null; }
  return resource;
}

async function folderBelongsToUser(id, userId) {
  if (!id) return true;
  const folder = await database.collection('folders').findOne({ _id: asId(id), ownerId: userId, isDeleted: false });
  return Boolean(folder);
}

async function getStarredSet(userId) {
  const stars = await database.collection('stars').find({ userId }).toArray();
  return new Set(stars.map(s => s.resourceId.toString()));
}

// -------------------------------------------------------------
// System Health
// -------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ status: 'ok', database: database ? 'mongodb' : 'demo' }));

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------
app.post('/api/auth/send-otp', async (req, res, next) => {
  try {
    const { phone, name } = req.body || {};
    if (!phone || typeof phone !== 'string' || phone.trim().length < 3) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Please provide a valid phone number.');
    }
    const cleanPhone = phone.trim();
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    otpStore.set(cleanPhone, { otp, name: (name || 'User').trim(), expiresAt });

    console.log(`[OTP] Code generated for ${cleanPhone}: ${otp}`);
    return res.json({
      success: true,
      message: `Demo OTP is: ${otp}`,
      otp
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/verify-otp', needDatabase, async (req, res, next) => {
  try {
    const { phone, otp, name } = req.body || {};
    if (!phone || !otp) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Phone number and OTP code are required.');
    }
    const cleanPhone = phone.trim();
    const enteredOtp = String(otp).trim();
    const record = otpStore.get(cleanPhone);

    if (!record || record.otp !== enteredOtp) {
      return apiError(res, 400, 'INVALID_OTP', 'Invalid OTP code. Please check and try again.');
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(cleanPhone);
      return apiError(res, 400, 'OTP_EXPIRED', 'OTP code has expired. Please request a new one.');
    }

    otpStore.delete(cleanPhone);
    const userName = (name || record.name || 'User').trim();
    const sanitizedEmail = `${cleanPhone.replace(/[^a-zA-Z0-9]/g, '')}@nimbus.local`;

    let user = await database.collection('users').findOne({
      $or: [{ phone: cleanPhone }, { email: sanitizedEmail.toLowerCase() }]
    });

    if (!user) {
      user = {
        email: sanitizedEmail.toLowerCase(),
        phone: cleanPhone,
        name: userName,
        createdAt: new Date()
      };
      const result = await database.collection('users').insertOne(user);
      user._id = result.insertedId;
      await logActivity(user._id, 'register', 'user', user._id, { method: 'otp' });
    } else if (name && name.trim()) {
      await database.collection('users').updateOne({ _id: user._id }, { $set: { name: userName } });
      user.name = userName;
    }

    const token = tokenFor(user);
    setSession(res, user);
    await logActivity(user._id, 'login', 'user', user._id, { method: 'otp' });
    return res.json({ user: publicUser(user), token });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/register', needDatabase, async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!/^\S+@\S+\.\S+$/.test(email || '') || typeof password !== 'string' || password.length < 8 || !validName(name, 80)) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Provide a valid email, name, and an 8+ character password.');
    }
    const user = { email: email.trim().toLowerCase(), name: name.trim(), passwordHash: await bcrypt.hash(password, 12), createdAt: new Date() };
    const result = await database.collection('users').insertOne(user);
    user._id = result.insertedId;
    const token = tokenFor(user);
    setSession(res, user);
    await logActivity(user._id, 'register', 'user', user._id, { method: 'password' });
    return res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    if (error?.code === 11000) return apiError(res, 409, 'EMAIL_EXISTS', 'An account already exists for that email.');
    return next(error);
  }
});

app.post('/api/auth/login', needDatabase, async (req, res, next) => {
  try {
    const user = await database.collection('users').findOne({ email: String(req.body.email || '').trim().toLowerCase() });
    if (!user || !user.passwordHash || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) {
      return apiError(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const token = tokenFor(user);
    setSession(res, user);
    await logActivity(user._id, 'login', 'user', user._id, { method: 'password' });
    return res.json({ user: publicUser(user), token });
  } catch (error) { return next(error); }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('nimbus_token', { path: '/' });
  res.status(204).end();
});

app.get('/api/auth/me', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const user = await database.collection('users').findOne({ _id: ownerId(req) });
    if (!user) return apiError(res, 401, 'UNAUTHENTICATED', 'Account no longer exists.');
    return res.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

// -------------------------------------------------------------
// Drive & Folders
// -------------------------------------------------------------
app.get('/api/drive', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const filter = { ownerId: ownerId(req), parentId: null, isDeleted: false };
    const fileFilter = { ownerId: ownerId(req), folderId: null, isDeleted: false };
    const [folders, files, starredSet] = await Promise.all([
      database.collection('folders').find(filter).sort({ name: 1 }).toArray(),
      database.collection('files').find(fileFilter).sort({ updatedAt: -1 }).toArray(),
      getStarredSet(ownerId(req))
    ]);
    return res.json({
      folder: { id: 'root', name: 'My Drive' },
      children: {
        folders: folders.map(f => publicItem(f, starredSet.has(f._id.toString()))),
        files: files.map(f => publicItem(f, starredSet.has(f._id.toString())))
      }
    });
  } catch (error) { return next(error); }
});

app.post('/api/folders', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const { name, parentId = null } = req.body;
    if (!validName(name, 80) || !(await folderBelongsToUser(parentId, ownerId(req)))) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Choose a valid folder name and destination.');
    }
    const timestamp = new Date();
    const folder = {
      type: 'folder',
      name: name.trim(),
      ownerId: ownerId(req),
      parentId: parentId ? asId(parentId) : null,
      isDeleted: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const result = await database.collection('folders').insertOne(folder);
    folder._id = result.insertedId;
    await logActivity(ownerId(req), 'create_folder', 'folder', folder._id, { name: folder.name });
    return res.status(201).json({ folder: publicItem(folder) });
  } catch (error) {
    if (error?.code === 11000) return apiError(res, 409, 'DUPLICATE_NAME', 'A folder with that name already exists here.');
    return next(error);
  }
});

app.get('/api/folders/:id', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const starredSet = await getStarredSet(ownerId(req));
    if (req.params.id === 'root') {
      const filter = { ownerId: ownerId(req), parentId: null, isDeleted: false };
      const fileFilter = { ownerId: ownerId(req), folderId: null, isDeleted: false };
      const [folders, files] = await Promise.all([
        database.collection('folders').find(filter).sort({ name: 1 }).toArray(),
        database.collection('files').find(fileFilter).sort({ updatedAt: -1 }).toArray()
      ]);
      return res.json({
        folder: { id: 'root', name: 'My Drive' },
        children: {
          folders: folders.map(f => publicItem(f, starredSet.has(f._id.toString()))),
          files: files.map(f => publicItem(f, starredSet.has(f._id.toString())))
        }
      });
    }

    const folder = await requireResourceAccess(req, res, 'folder', req.params.id);
    if (!folder) return;

    const filter = { ownerId: folder.ownerId, parentId: folder._id, isDeleted: false };
    const [folders, files] = await Promise.all([
      database.collection('folders').find(filter).sort({ name: 1 }).toArray(),
      database.collection('files').find({ ownerId: folder.ownerId, folderId: folder._id, isDeleted: false }).sort({ updatedAt: -1 }).toArray()
    ]);
    return res.json({
      folder: publicItem(folder, starredSet.has(folder._id.toString())),
      children: {
        folders: folders.map(f => publicItem(f, starredSet.has(f._id.toString()))),
        files: files.map(f => publicItem(f, starredSet.has(f._id.toString())))
      }
    });
  } catch (error) { return next(error); }
});

app.patch('/api/folders/:id', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const folder = await requireResourceAccess(req, res, 'folder', req.params.id, true);
    if (!folder) return;
    const update = { updatedAt: new Date() };

    if (req.body.name !== undefined) {
      if (!validName(req.body.name, 80)) return apiError(res, 400, 'VALIDATION_ERROR', 'Folder name is invalid.');
      update.name = req.body.name.trim();
    }
    if (req.body.parentId !== undefined) {
      if (!(await folderBelongsToUser(req.body.parentId, ownerId(req))) || req.body.parentId === req.params.id) {
        return apiError(res, 400, 'INVALID_MOVE', 'That folder cannot be the destination.');
      }
      update.parentId = req.body.parentId ? asId(req.body.parentId) : null;
    }
    await database.collection('folders').updateOne({ _id: folder._id }, { $set: update });
    const changed = { ...folder, ...update };
    await logActivity(ownerId(req), update.name ? 'rename' : 'move', 'folder', folder._id, update);
    return res.json({ folder: publicItem(changed) });
  } catch (error) {
    if (error?.code === 11000) return apiError(res, 409, 'DUPLICATE_NAME', 'A folder with that name already exists here.');
    return next(error);
  }
});

app.delete('/api/folders/:id', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const folder = await requireResourceAccess(req, res, 'folder', req.params.id, true);
    if (!folder) return;
    const deletedAt = new Date();
    await database.collection('folders').updateOne({ _id: folder._id }, { $set: { isDeleted: true, deletedAt, updatedAt: deletedAt } });
    await logActivity(ownerId(req), 'delete', 'folder', folder._id, { name: folder.name });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// -------------------------------------------------------------
// Files & Versions
// -------------------------------------------------------------
app.post('/api/files', needDatabase, requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file || !validName(req.file.originalname) || !(await folderBelongsToUser(req.body.folderId || null, ownerId(req)))) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Provide a file and a valid destination folder.');
    }
    const stream = bucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype, metadata: { ownerId: ownerId(req).toString() } });
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end(req.file.buffer);
    });

    const timestamp = new Date();
    const file = {
      type: 'file',
      name: req.file.originalname,
      mimeType: req.file.mimetype || 'application/octet-stream',
      sizeBytes: req.file.size,
      gridfsId: stream.id,
      versionNumber: 1,
      ownerId: ownerId(req),
      folderId: req.body.folderId ? asId(req.body.folderId) : null,
      isDeleted: false,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const result = await database.collection('files').insertOne(file);
    file._id = result.insertedId;

    // Save initial version
    await database.collection('file_versions').insertOne({
      fileId: file._id,
      versionNumber: 1,
      gridfsId: stream.id,
      name: file.name,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
      createdBy: ownerId(req),
      createdAt: timestamp
    });

    await logActivity(ownerId(req), 'upload', 'file', file._id, { name: file.name, sizeBytes: file.sizeBytes, version: 1 });
    return res.status(201).json({ file: publicItem(file) });
  } catch (error) { return next(error); }
});

app.get('/api/files/:id', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const file = await requireResourceAccess(req, res, 'file', req.params.id);
    if (file) {
      return res.json({
        file: publicItem(file),
        downloadUrl: `/api/files/${file._id}/download`,
        previewUrl: `/api/files/${file._id}/preview`
      });
    }
  } catch (error) { return next(error); }
});

app.get('/api/files/:id/download', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const file = await requireResourceAccess(req, res, 'file', req.params.id);
    if (!file) return;
    res.set({
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff'
    });
    bucket.openDownloadStream(file.gridfsId).on('error', next).pipe(res);
    await logActivity(ownerId(req), 'download', 'file', file._id);
  } catch (error) { return next(error); }
});

// Inline Preview endpoint (Images, PDFs, Video, Audio, Text)
app.get('/api/files/:id/preview', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const file = await requireResourceAccess(req, res, 'file', req.params.id);
    if (!file) return;
    res.set({
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'X-Content-Type-Options': 'nosniff'
    });
    bucket.openDownloadStream(file.gridfsId).on('error', next).pipe(res);
  } catch (error) { return next(error); }
});

app.patch('/api/files/:id', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const file = await requireResourceAccess(req, res, 'file', req.params.id, true);
    if (!file) return;
    const update = { updatedAt: new Date() };

    if (req.body.name !== undefined) {
      if (!validName(req.body.name)) return apiError(res, 400, 'VALIDATION_ERROR', 'File name is invalid.');
      update.name = req.body.name.trim();
    }
    if (req.body.folderId !== undefined) {
      if (!(await folderBelongsToUser(req.body.folderId, ownerId(req)))) {
        return apiError(res, 400, 'INVALID_MOVE', 'Destination folder is invalid.');
      }
      update.folderId = req.body.folderId ? asId(req.body.folderId) : null;
    }
    await database.collection('files').updateOne({ _id: file._id }, { $set: update });
    const changed = { ...file, ...update };
    await logActivity(ownerId(req), update.name ? 'rename' : 'move', 'file', file._id, update);
    return res.json({ file: publicItem(changed) });
  } catch (error) { return next(error); }
});

app.delete('/api/files/:id', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const file = await requireResourceAccess(req, res, 'file', req.params.id, true);
    if (!file) return;
    const deletedAt = new Date();
    await database.collection('files').updateOne({ _id: file._id }, { $set: { isDeleted: true, deletedAt, updatedAt: deletedAt } });
    await logActivity(ownerId(req), 'delete', 'file', file._id, { name: file.name });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// Version History Endpoints
app.get('/api/files/:id/versions', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const file = await requireResourceAccess(req, res, 'file', req.params.id);
    if (!file) return;
    const versions = await database.collection('file_versions').find({ fileId: file._id }).sort({ versionNumber: -1 }).toArray();
    return res.json({
      versions: versions.map(v => ({
        id: v._id.toString(),
        versionNumber: v.versionNumber,
        name: v.name,
        sizeBytes: v.sizeBytes,
        mimeType: v.mimeType,
        createdAt: v.createdAt,
        downloadUrl: `/api/files/${file._id}/versions/${v._id}/download`
      }))
    });
  } catch (error) { return next(error); }
});

app.post('/api/files/:id/versions', needDatabase, requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const file = await requireResourceAccess(req, res, 'file', req.params.id, true);
    if (!file || !req.file) return apiError(res, 400, 'VALIDATION_ERROR', 'File payload required.');

    const stream = bucket.openUploadStream(req.file.originalname, { contentType: req.file.mimetype, metadata: { ownerId: ownerId(req).toString() } });
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end(req.file.buffer);
    });

    const newVersionNum = (file.versionNumber || 1) + 1;
    const timestamp = new Date();

    await database.collection('file_versions').insertOne({
      fileId: file._id,
      versionNumber: newVersionNum,
      gridfsId: stream.id,
      name: req.file.originalname,
      sizeBytes: req.file.size,
      mimeType: req.file.mimetype || 'application/octet-stream',
      createdBy: ownerId(req),
      createdAt: timestamp
    });

    await database.collection('files').updateOne({ _id: file._id }, {
      $set: {
        gridfsId: stream.id,
        sizeBytes: req.file.size,
        mimeType: req.file.mimetype || file.mimeType,
        versionNumber: newVersionNum,
        updatedAt: timestamp
      }
    });

    await logActivity(ownerId(req), 'new_version', 'file', file._id, { version: newVersionNum, sizeBytes: req.file.size });
    return res.status(201).json({ message: `Version ${newVersionNum} uploaded successfully.` });
  } catch (error) { return next(error); }
});

app.get('/api/files/:id/versions/:versionId/download', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const file = await requireResourceAccess(req, res, 'file', req.params.id);
    if (!file) return;
    const version = await database.collection('file_versions').findOne({ _id: asId(req.params.versionId), fileId: file._id });
    if (!version) return apiError(res, 404, 'NOT_FOUND', 'Version not found.');

    res.set({
      'Content-Type': version.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(version.name)}`,
      'X-Content-Type-Options': 'nosniff'
    });
    bucket.openDownloadStream(version.gridfsId).on('error', next).pipe(res);
  } catch (error) { return next(error); }
});

// -------------------------------------------------------------
// Sharing & Link Sharing
// -------------------------------------------------------------
app.post('/api/shares', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const { resourceType, resourceId, granteeEmail, role } = req.body;
    if (!['viewer', 'editor'].includes(role)) return apiError(res, 400, 'VALIDATION_ERROR', 'Role must be viewer or editor.');

    const resource = await requireResourceAccess(req, res, resourceType, resourceId, true);
    if (!resource) return;

    const user = await database.collection('users').findOne({ email: String(granteeEmail || '').trim().toLowerCase() });
    if (!user) return apiError(res, 404, 'USER_NOT_FOUND', 'No account exists for that email.');

    const share = { resourceType, resourceId: resource._id, granteeUserId: user._id, role, createdBy: ownerId(req), createdAt: new Date() };
    await database.collection('shares').updateOne({ resourceType, resourceId: resource._id, granteeUserId: user._id }, { $set: share }, { upsert: true });
    await logActivity(ownerId(req), 'share', resourceType, resource._id, { granteeUserId: user._id, granteeEmail: user.email, role });
    return res.status(201).json({ share: { ...share, resourceId: resource._id.toString(), granteeUserId: user._id.toString() } });
  } catch (error) { return next(error); }
});

app.get('/api/shares/:resourceType/:resourceId', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const resource = await requireResourceAccess(req, res, req.params.resourceType, req.params.resourceId);
    if (!resource) return;

    const shares = await database.collection('shares').aggregate([
      { $match: { resourceType: req.params.resourceType, resourceId: resource._id } },
      { $lookup: { from: 'users', localField: 'granteeUserId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $project: { role: 1, createdAt: 1, email: '$user.email', name: '$user.name' } }
    ]).toArray();
    return res.json({ shares: shares.map(s => ({ id: s._id.toString(), email: s.email, name: s.name, role: s.role, createdAt: s.createdAt })) });
  } catch (error) { return next(error); }
});

app.delete('/api/shares/:id', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const share = await database.collection('shares').findOne({ _id: asId(req.params.id), createdBy: ownerId(req) });
    if (!share) return apiError(res, 404, 'NOT_FOUND', 'Share not found.');
    await database.collection('shares').deleteOne({ _id: share._id });
    await logActivity(ownerId(req), 'unshare', share.resourceType, share.resourceId, { granteeUserId: share.granteeUserId });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.post('/api/link-shares', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const resource = await requireResourceAccess(req, res, req.body.resourceType, req.body.resourceId, true);
    if (!resource) return;
    const expiryDays = Number(req.body.expiryDays || 0);
    const link = {
      resourceType: req.body.resourceType,
      resourceId: resource._id,
      token: crypto.randomUUID().replaceAll('-', ''),
      role: 'viewer',
      passwordHash: req.body.password ? await bcrypt.hash(req.body.password, 12) : null,
      expiresAt: expiryDays ? new Date(Date.now() + expiryDays * 86400000) : null,
      createdBy: ownerId(req),
      createdAt: new Date()
    };
    const result = await database.collection('linkShares').insertOne(link);
    await logActivity(ownerId(req), 'create_link', req.body.resourceType, resource._id, { expiresAt: link.expiresAt });
    return res.status(201).json({ link: { id: result.insertedId.toString(), token: link.token, expiresAt: link.expiresAt } });
  } catch (error) { return next(error); }
});

app.get('/api/link/:token', needDatabase, async (req, res, next) => {
  try {
    const link = await database.collection('linkShares').findOne({ token: req.params.token });
    if (!link || (link.expiresAt && link.expiresAt < new Date())) {
      return apiError(res, 404, 'LINK_NOT_FOUND', 'This link is unavailable or has expired.');
    }
    const resource = await findResource(link.resourceType, link.resourceId);
    if (!resource || resource.isDeleted) {
      return apiError(res, 404, 'NOT_FOUND', 'This item is no longer available.');
    }

    if (link.passwordHash) {
      const providedPassword = req.headers['x-link-password'];
      if (!providedPassword || !(await bcrypt.compare(providedPassword, link.passwordHash))) {
        return res.json({ resource: { id: resource._id.toString(), name: resource.name, type: resource.type }, passwordRequired: true });
      }
    }

    return res.json({
      resource: publicItem(resource),
      downloadUrl: `/api/link/${link.token}/download`,
      previewUrl: `/api/link/${link.token}/preview`,
      passwordRequired: false
    });
  } catch (error) { return next(error); }
});

app.get('/api/link/:token/download', needDatabase, async (req, res, next) => {
  try {
    const link = await database.collection('linkShares').findOne({ token: req.params.token });
    if (!link || (link.expiresAt && link.expiresAt < new Date())) return apiError(res, 404, 'LINK_NOT_FOUND', 'Link expired.');
    const resource = await findResource(link.resourceType, link.resourceId);
    if (!resource || resource.isDeleted || link.resourceType !== 'file') return apiError(res, 404, 'NOT_FOUND', 'File not found.');

    res.set({
      'Content-Type': resource.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(resource.name)}`,
      'X-Content-Type-Options': 'nosniff'
    });
    bucket.openDownloadStream(resource.gridfsId).on('error', next).pipe(res);
  } catch (error) { return next(error); }
});

// -------------------------------------------------------------
// Stars, Recent, Trash, Search, Activities
// -------------------------------------------------------------
app.get('/api/recent', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 50);
    const filter = { ownerId: ownerId(req), isDeleted: false };
    const [files, starredSet] = await Promise.all([
      database.collection('files').find(filter).sort({ updatedAt: -1 }).limit(limit).toArray(),
      getStarredSet(ownerId(req))
    ]);
    return res.json({ items: files.map(f => publicItem(f, starredSet.has(f._id.toString()))) });
  } catch (error) { return next(error); }
});

app.get('/api/starred', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const stars = await database.collection('stars').find({ userId: ownerId(req) }).toArray();
    const folderIds = stars.filter(s => s.resourceType === 'folder').map(s => s.resourceId);
    const fileIds = stars.filter(s => s.resourceType === 'file').map(s => s.resourceId);
    const [folders, files] = await Promise.all([
      database.collection('folders').find({ _id: { $in: folderIds }, isDeleted: false }).toArray(),
      database.collection('files').find({ _id: { $in: fileIds }, isDeleted: false }).toArray()
    ]);
    return res.json({ items: [...folders.map(f => publicItem(f, true)), ...files.map(f => publicItem(f, true))] });
  } catch (error) { return next(error); }
});

app.post('/api/stars', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const resource = await requireResourceAccess(req, res, req.body.resourceType, req.body.resourceId);
    if (!resource) return;
    await database.collection('stars').updateOne(
      { userId: ownerId(req), resourceType: req.body.resourceType, resourceId: resource._id },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    return res.status(201).end();
  } catch (error) { return next(error); }
});

app.delete('/api/stars', needDatabase, requireAuth, async (req, res, next) => {
  try {
    await database.collection('stars').deleteOne({
      userId: ownerId(req),
      resourceType: req.body.resourceType,
      resourceId: asId(req.body.resourceId)
    });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.get('/api/trash', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const filter = { ownerId: ownerId(req), isDeleted: true };
    const [folders, files] = await Promise.all([
      database.collection('folders').find(filter).sort({ deletedAt: -1 }).toArray(),
      database.collection('files').find(filter).sort({ deletedAt: -1 }).toArray()
    ]);
    return res.json({ items: [...folders.map(f => publicItem(f, false)), ...files.map(f => publicItem(f, false))] });
  } catch (error) { return next(error); }
});

app.post('/api/trash/restore', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const resource = await findResource(req.body.resourceType, req.body.resourceId);
    if (!resource || !resource.ownerId.equals(ownerId(req)) || !resource.isDeleted) {
      return apiError(res, 404, 'NOT_FOUND', 'Deleted item was not found.');
    }
    const collection = req.body.resourceType === 'folder' ? 'folders' : 'files';
    await database.collection(collection).updateOne({ _id: resource._id }, { $set: { isDeleted: false, deletedAt: null, updatedAt: new Date() } });
    await logActivity(ownerId(req), 'restore', req.body.resourceType, resource._id, { name: resource.name });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// Permanent Delete
app.delete('/api/trash/:resourceType/:resourceId', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.params;
    const resource = await findResource(resourceType, resourceId);
    if (!resource || !resource.ownerId.equals(ownerId(req))) return apiError(res, 404, 'NOT_FOUND', 'Item not found.');

    if (resourceType === 'file' && resource.gridfsId) {
      try { await bucket.delete(resource.gridfsId); } catch {}
      await database.collection('file_versions').deleteMany({ fileId: resource._id });
      await database.collection('files').deleteOne({ _id: resource._id });
    } else {
      await database.collection('folders').deleteOne({ _id: resource._id });
    }
    await database.collection('shares').deleteMany({ resourceType, resourceId: resource._id });
    await database.collection('linkShares').deleteMany({ resourceType, resourceId: resource._id });
    await database.collection('stars').deleteMany({ resourceType, resourceId: resource._id });
    await logActivity(ownerId(req), 'delete_permanent', resourceType, resource._id, { name: resource.name });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// Empty Trash
app.post('/api/trash/empty', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const filter = { ownerId: ownerId(req), isDeleted: true };
    const files = await database.collection('files').find(filter).toArray();
    for (const f of files) {
      if (f.gridfsId) try { await bucket.delete(f.gridfsId); } catch {}
      await database.collection('file_versions').deleteMany({ fileId: f._id });
    }
    await database.collection('files').deleteMany(filter);
    await database.collection('folders').deleteMany(filter);
    await logActivity(ownerId(req), 'empty_trash', 'trash', ownerId(req));
    return res.status(204).end();
  } catch (error) { return next(error); }
});

// Search
app.get('/api/search', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const base = { ownerId: ownerId(req), isDeleted: false };
    const name = query ? { name: { $regex: escapeRegExp(query), $options: 'i' } } : {};
    const [folders, files, starredSet] = await Promise.all([
      database.collection('folders').find({ ...base, ...name }).limit(limit).toArray(),
      database.collection('files').find({ ...base, ...name }).limit(limit).toArray(),
      getStarredSet(ownerId(req))
    ]);
    return res.json({
      items: [...folders.map(f => publicItem(f, starredSet.has(f._id.toString()))), ...files.map(f => publicItem(f, starredSet.has(f._id.toString())))]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, limit)
    });
  } catch (error) { return next(error); }
});

// Activities / Audit Log
app.get('/api/activities', needDatabase, requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const activities = await database.collection('activities').find({ actorId: ownerId(req) }).sort({ createdAt: -1 }).limit(limit).toArray();
    return res.json({
      activities: activities.map(a => ({
        id: a._id.toString(),
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId?.toString() || null,
        context: a.context || {},
        createdAt: a.createdAt
      }))
    });
  } catch (error) { return next(error); }
});

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
app.use(express.static(path.resolve('.'), { dotfiles: 'deny', extensions: ['html'], index: 'index.html', maxAge: 0 }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.resolve('./index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (error instanceof multer.MulterError) return apiError(res, 400, 'UPLOAD_ERROR', error.message);
  return apiError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
});

async function initDb() {
  if (database) return database;
  if (mongoUri) {
    client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    database = client.db(databaseName);
    bucket = new GridFSBucket(database, { bucketName: 'uploads' });
    try { await ensureMongoIndexes(database); } catch {}
    console.log(`MongoDB connected: ${databaseName}`);
  }
  return database;
}

// Auto-connect database for serverless requests
app.use(async (req, res, next) => {
  if (!database && mongoUri) {
    try { await initDb(); } catch (err) { console.error('MongoDB init error:', err); }
  }
  next();
});

if (process.env.VERCEL !== '1') {
  initDb().then(() => {
    app.listen(port, () => console.log(`Nimbus Drive is running on http://localhost:${port}`));
  }).catch((error) => {
    console.error('Could not start Nimbus Drive:', error.message);
    app.listen(port, () => console.log(`Nimbus Drive is running without DB on http://localhost:${port}`));
  });
}

export default app;
