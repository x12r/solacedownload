const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const shortid = require('shortid');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.ensureDirSync(UPLOADS_DIR);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueId = shortid.generate();
    const extension = path.extname(file.originalname);
    const filename = `${uniqueId}${extension}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types
    cb(null, true);
  }
});

// Store file info in memory (use database in production)
let fileDatabase = [];
try {
  const data = fs.readFileSync(path.join(__dirname, 'database.json'), 'utf8');
  fileDatabase = JSON.parse(data);
} catch (err) {
  fileDatabase = [];
}

function saveDatabase() {
  fs.writeFileSync(path.join(__dirname, 'database.json'), JSON.stringify(fileDatabase, null, 2));
}

// Routes

// Serve static files (HTML, CSS, JS)
app.use(express.static('public'));

// Upload file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = {
      id: shortid.generate(),
      filename: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadDate: new Date().toISOString(),
      downloadCount: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    };

    fileDatabase.push(fileInfo);
    saveDatabase();

    const downloadUrl = `${req.protocol}://${req.get('host')}/d/${fileInfo.id}`;
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: fileInfo,
      downloadUrl: downloadUrl,
      directDownloadUrl: `${req.protocol}://${req.get('host')}/download/${fileInfo.id}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

// Download file page (auto-downloads)
app.get('/d/:id', (req, res) => {
  try {
    const fileInfo = fileDatabase.find(f => f.id === req.params.id);
    
    if (!fileInfo) {
      return res.status(404).send(`
        <html>
        <head>
          <title>File Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #ff4444; font-size: 24px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="error">⚠️ File Not Found</div>
          <p>The requested file doesn't exist or has expired.</p>
          <a href="/">← Back to Upload</a>
        </body>
        </html>
      `);
    }

    // Check if file expired
    if (new Date(fileInfo.expiresAt) < new Date()) {
      return res.status(410).send(`
        <html>
        <head>
          <title>File Expired</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #ff8800; font-size: 24px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="error">⏰ File Expired</div>
          <p>This file has expired (7-day limit).</p>
          <a href="/">← Back to Upload</a>
        </body>
        </html>
      `);
    }

    // Update download count
    fileInfo.downloadCount++;
    saveDatabase();

    // Create auto-download page
    const filePath = path.join(UPLOADS_DIR, fileInfo.storedName);
    const safeFilename = encodeURIComponent(fileInfo.filename);
    
    // Force download with auto-redirect
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Downloading ${fileInfo.filename}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f0323 0%, #2e0f4b 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            text-align: center;
            background: rgba(30, 10, 55, 0.9);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(120, 50, 200, 0.2);
            max-width: 500px;
            width: 100%;
        }
        
        .icon {
            font-size: 4em;
            color: #B445FF;
            margin-bottom: 20px;
            animation: pulse 2s infinite;
        }
        
        h1 {
            color: #B445FF;
            margin-bottom: 20px;
            font-size: 1.8em;
        }
        
        .file-info {
            background: rgba(45, 15, 75, 0.6);
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
        }
        
        .file-info p {
            margin: 10px 0;
            color: #d0d0ff;
        }
        
        .download-btn {
            background: linear-gradient(135deg, #7832C7 0%, #B445FF 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 1.2em;
            border-radius: 10px;
            cursor: pointer;
            margin: 20px 0;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s ease;
            font-weight: bold;
        }
        
        .download-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(180, 69, 255, 0.4);
        }
        
        .loading {
            color: #B445FF;
            margin-top: 20px;
            font-size: 1.1em;
        }
        
        .progress-bar {
            width: 100%;
            height: 10px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 5px;
            margin: 20px 0;
            overflow: hidden;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #7832C7, #B445FF);
            width: 0%;
            transition: width 0.3s ease;
            border-radius: 5px;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        
        .countdown {
            font-size: 0.9em;
            color: #b8b8d1;
            margin-top: 10px;
        }
        
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid rgba(120, 50, 200, 0.2);
            color: #b8b8d1;
            font-size: 0.9em;
        }
        
        .footer a {
            color: #B445FF;
            text-decoration: none;
        }
        
        .footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">📁</div>
        <h1>Downloading File</h1>
        
        <div class="file-info">
            <p><strong>File Name:</strong> ${fileInfo.filename}</p>
            <p><strong>File Size:</strong> ${formatBytes(fileInfo.size)}</p>
            <p><strong>Upload Date:</strong> ${new Date(fileInfo.uploadDate).toLocaleDateString()}</p>
            <p><strong>Downloads:</strong> ${fileInfo.downloadCount}</p>
        </div>
        
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
        
        <p class="loading" id="loadingText">Preparing download...</p>
        
        <div class="countdown" id="countdown">Auto-download in <span id="countdownNumber">5</span> seconds</div>
        
        <a href="/api/download/${fileInfo.id}" class="download-btn" id="downloadLink">
            ⬇️ Download ${fileInfo.filename}
        </a>
        
        <div class="footer">
            Powered by <a href="/">File Share</a> • Files expire after 7 days
        </div>
    </div>
    
    <script>
        let countdown = 5;
        const countdownElement = document.getElementById('countdownNumber');
        const progressFill = document.getElementById('progressFill');
        const loadingText = document.getElementById('loadingText');
        const downloadLink = document.getElementById('downloadLink');
        
        function updateProgress() {
            const progress = ((5 - countdown) / 5) * 100;
            progressFill.style.width = progress + '%';
            
            if (countdown > 0) {
                countdown--;
                countdownElement.textContent = countdown;
                loadingText.textContent = countdown === 0 ? 'Starting download...' : 'Preparing download...';
                setTimeout(updateProgress, 1000);
            } else {
                // Auto-click download link after countdown
                downloadLink.click();
                loadingText.textContent = 'Download started!';
                countdownElement.parentElement.style.display = 'none';
            }
        }
        
        // Start the countdown
        setTimeout(updateProgress, 1000);
        
        // Fallback: if user clicks manually
        downloadLink.addEventListener('click', function() {
            loadingText.textContent = 'Download started!';
            countdownElement.parentElement.style.display = 'none';
            progressFill.style.width = '100%';
        });
        
        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }
    </script>
</body>
</html>
    `);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('Internal server error');
  }
});

// Direct file download (no page, just the file)
app.get('/api/download/:id', (req, res) => {
  try {
    const fileInfo = fileDatabase.find(f => f.id === req.params.id);
    
    if (!fileInfo) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(UPLOADS_DIR, fileInfo.storedName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Set headers for download
    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.filename)}"`);
    res.setHeader('Content-Length', fileInfo.size);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Direct download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Get all files (admin view)
app.get('/api/files', (req, res) => {
  res.json({
    success: true,
    count: fileDatabase.length,
    files: fileDatabase.map(f => ({
      id: f.id,
      filename: f.filename,
      size: f.size,
      uploadDate: f.uploadDate,
      downloadCount: f.downloadCount,
      expiresAt: f.expiresAt,
      downloadUrl: `${req.protocol}://${req.get('host')}/d/${f.id}`
    }))
  });
});

// Delete file
app.delete('/api/files/:id', (req, res) => {
  try {
    const index = fileDatabase.findIndex(f => f.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileInfo = fileDatabase[index];
    const filePath = path.join(UPLOADS_DIR, fileInfo.storedName);
    
    // Remove file from disk
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Remove from database
    fileDatabase.splice(index, 1);
    saveDatabase();
    
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${UPLOADS_DIR}`);
  console.log(`🌐 Web interface: http://localhost:${PORT}`);
});
