// Server-side PDF generation using jsPDF
// Returns a Buffer containing the PDF

async function generatePDF(report, email) {
  // jsPDF runs in Node via canvas — we build it manually
  // For production, consider using puppeteer for pixel-perfect PDFs
  // This implementation uses jsPDF UMD in Node context

  const { jsPDF } = require('jspdf');

  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const W = 210, M = 18;
  const { domain, score, checks, topIssues, quickWins, aiSummary, analyzedAt } = report;
  const now = new Date(analyzedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const passCount = Object.values(checks).filter(c => c.status === 'pass').length;
  const failCount = Object.values(checks).filter(c => c.status === 'fail').length;
  const warnCount = Object.values(checks).filter(c => c.status === 'warn').length;

  // ── HEADER BAR ──
  doc.setFillColor(13, 148, 136);
  doc.rect(0, 0, W, 52, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Bloom SEO Report', M, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(domain, M, 33);

  doc.setFontSize(8);
  doc.setTextColor(204, 255, 247);
  doc.text(`Generated ${now}  ·  Delivered to ${email}  ·  bloominternet.com`, M, 43);

  // Score badge
  const scoreColor = score >= 80 ? [16, 185, 129] : score >= 60 ? [245, 158, 11] : [239, 68, 68];
  doc.setFillColor(10, 15, 30);
  doc.circle(W - M - 15, 28, 18, 'F');
  doc.setTextColor(...scoreColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(String(score), W - M - 15, 32, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(150, 170, 180);
  doc.setFont('helvetica', 'normal');
  doc.text('/ 100', W - M - 15, 40, { align: 'center' });

  // ── SCORE SUMMARY CARDS ──
  let y = 62;
  [
    [passCount, 'Passed', [16, 185, 129]],
    [failCount, 'Failed', [239, 68, 68]],
    [warnCount, 'Warnings', [245, 158, 11]],
  ].forEach(([n, label, col], i) => {
    const x = M + i * 58;
    doc.setFillColor(col[0] * 0.08 + 8, col[1] * 0.08 + 8, col[2] * 0.08 + 15);
    doc.roundedRect(x, y, 52, 18, 2, 2, 'F');
    doc.setTextColor(...col);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(String(n), x + 9, y + 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(180, 190, 200);
    doc.text(label, x + 22, y + 13);
  });

  // ── AI SUMMARY ──
  y = 90;
  doc.setFillColor(14, 22, 40);
  doc.roundedRect(M, y, W - M * 2, 26, 2, 2, 'F');
  doc.setTextColor(94, 234, 212);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('AI ANALYSIS', M + 5, y + 7);
  doc.setTextColor(180, 195, 210);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const summaryLines = doc.splitTextToSize(aiSummary, W - M * 2 - 10);
  doc.text(summaryLines.slice(0, 3), M + 5, y + 14);

  // ── TOP ISSUES & QUICK WINS ──
  y = 124;
  const colW = (W - M * 2 - 8) / 2;

  // Issues box
  doc.setFillColor(40, 15, 15);
  doc.roundedRect(M, y, colW, 38, 2, 2, 'F');
  doc.setTextColor(239, 68, 68);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('TOP ISSUES', M + 5, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 170, 170);
  doc.setFontSize(7);
  topIssues.forEach((issue, i) => {
    const lines = doc.splitTextToSize('✕  ' + issue, colW - 10);
    doc.text(lines[0], M + 5, y + 15 + i * 9);
  });

  // Wins box
  const wx = M + colW + 8;
  doc.setFillColor(10, 35, 25);
  doc.roundedRect(wx, y, colW, 38, 2, 2, 'F');
  doc.setTextColor(16, 185, 129);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('QUICK WINS', wx + 5, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 210, 185);
  doc.setFontSize(7);
  quickWins.forEach((win, i) => {
    const lines = doc.splitTextToSize('→  ' + win, colW - 10);
    doc.text(lines[0], wx + 5, y + 15 + i * 9);
  });

  // ── DETAILED CHECKS ──
  const SECTIONS = [
    { title: 'On-Page SEO', keys: ['title','metaDescription','h1','headingStructure','imageAltText','internalLinks','externalLinks','wordCount'] },
    { title: 'Technical SEO', keys: ['https','robotsTxt','sitemapXml','canonical','robotsMeta','schemaMarkup','viewport','favicon'] },
    { title: 'Social & Performance', keys: ['openGraph','twitterCard','pageSpeed'] },
  ];

  const CHECK_NAMES = {
    title: 'Title Tag', metaDescription: 'Meta Description', h1: 'H1 Tag',
    headingStructure: 'Heading Structure', imageAltText: 'Image Alt Text',
    internalLinks: 'Internal Links', externalLinks: 'External Links', wordCount: 'Word Count',
    https: 'HTTPS / SSL', robotsTxt: 'robots.txt', sitemapXml: 'sitemap.xml',
    canonical: 'Canonical Tag', robotsMeta: 'Robots Meta', schemaMarkup: 'Schema Markup',
    viewport: 'Viewport Tag', favicon: 'Favicon', openGraph: 'Open Graph Tags',
    twitterCard: 'Twitter Card', pageSpeed: 'Page Speed',
  };

  y = 170;

  SECTIONS.forEach(section => {
    if (y > 265) {
      doc.addPage();
      doc.setFillColor(10, 15, 30);
      doc.rect(0, 0, W, 297, 'F');
      y = 20;
    }

    doc.setTextColor(13, 148, 136);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(section.title.toUpperCase(), M, y);
    y += 5;

    section.keys.forEach(key => {
      if (y > 272) {
        doc.addPage();
        doc.setFillColor(10, 15, 30);
        doc.rect(0, 0, W, 297, 'F');
        y = 20;
      }

      const check = checks[key];
      if (!check) return;

      const col = check.status === 'pass' ? [16,185,129] : check.status === 'fail' ? [239,68,68] : [245,158,11];
      const bgCol = check.status === 'pass' ? [10,30,20] : check.status === 'fail' ? [30,10,10] : [30,25,10];

      doc.setFillColor(...bgCol);
      doc.roundedRect(M, y, W - M * 2, 13, 1.5, 1.5, 'F');

      // Status badge
      doc.setFillColor(...col.map(c => Math.min(255, c + 20)));
      doc.roundedRect(M + 2, y + 3, 18, 7, 1, 1, 'F');
      doc.setTextColor(10, 15, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(check.status.toUpperCase(), M + 11, y + 8, { align: 'center' });

      // Check name
      doc.setTextColor(220, 230, 240);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(CHECK_NAMES[key] || key, M + 23, y + 6);

      // Note
      doc.setTextColor(150, 165, 185);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const noteLines = doc.splitTextToSize(check.note, W - M * 2 - 26);
      doc.text(noteLines[0], M + 23, y + 11);

      y += 15;
    });
    y += 4;
  });

  // ── FOOTER ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(10, 15, 30);
    doc.rect(0, 285, W, 12, 'F');
    doc.setTextColor(80, 100, 120);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('© 2026 bloominternet.com · Bloom SEO · bloominternet.com', W / 2, 292, { align: 'center' });
    doc.text(`Page ${i} of ${pageCount}`, W - M, 292, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

module.exports = { generatePDF };
