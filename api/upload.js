// api/upload.js - Vercel serverless function
import { google } from 'googleapis';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*'); // V produkcii zmeň na tvoju doménu
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Starting file upload process...');

    // Parse form data
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    console.log('Files parsed:', Object.keys(files));

    // Initialize Google Drive API
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        universe_domain: 'googleapis.com'
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });
    console.log('Google Drive API initialized');

    // Upload each file
    const uploadResults = [];
    const fileEntries = Object.entries(files);

    for (const [fieldName, fileArray] of fileEntries) {
      // Handle both single file and array of files
      const filesToProcess = Array.isArray(fileArray) ? fileArray : [fileArray];
      
      for (const file of filesToProcess) {
        try {
          console.log(`Uploading file: ${file.originalFilename}`);

          // Generate unique filename
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const uniqueFilename = `${timestamp}_${file.originalFilename}`;

          const fileMetadata = {
            name: uniqueFilename,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
          };

          const media = {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.filepath),
          };

          const uploadResult = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id,name',
          });

          uploadResults.push({
            originalName: file.originalFilename,
            driveFileId: uploadResult.data.id,
            driveName: uploadResult.data.name,
          });

          console.log(`File uploaded successfully: ${uploadResult.data.name}`);

          // Clean up temporary file
          fs.unlinkSync(file.filepath);
        } catch (fileError) {
          console.error(`Error uploading file ${file.originalFilename}:`, fileError);
          uploadResults.push({
            originalName: file.originalFilename,
            error: fileError.message,
          });
        }
      }
    }

    console.log('Upload process completed');
    
    res.status(200).json({
      success: true,
      message: `Successfully uploaded ${uploadResults.filter(r => !r.error).length} files`,
      results: uploadResults,
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      details: error.message,
    });
  }
}
