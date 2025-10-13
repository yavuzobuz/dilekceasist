import express from 'express';
import htmlToDocx from 'html-to-docx';
import cors from 'cors';

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// HTML to DOCX conversion endpoint
app.post('/api/html-to-docx', async (req, res) => {
  try {
    const { html, options } = req.body;

    if (!html) {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    // Generate DOCX
    const fileBuffer = await htmlToDocx(html, null, {
      font: options?.font || 'Calibri',
      fontSize: options?.fontSize || '22',
      ...options
    });

    // Send as downloadable file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="dilekce.docx"');
    res.send(Buffer.from(fileBuffer));
  } catch (error) {
    console.error('Error generating DOCX:', error);
    res.status(500).json({ error: 'Failed to generate DOCX file' });
  }
});

app.listen(PORT, () => {
  console.log(`DOCX conversion server running on http://localhost:${PORT}`);
});
