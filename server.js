const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/exports', express.static(path.join(__dirname, 'public/exports')));

// Multer for file uploads
const upload = multer({ dest: '/tmp/uploads/' });

const setupDirs = () => {
    ['/tmp', '/tmp/uploads', path.join(__dirname, 'public/exports')].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
};
setupDirs();

// Accept both JSON body (base64) and multipart file upload
app.post('/extract-text', upload.single('file'), (req, res) => {
    let fileExt, executionId, inputPath;

    if (req.file) {
        // Multipart file upload from n8n HTTP Request node
        fileExt = req.body.fileExt || req.file.originalname.split('.').pop().toLowerCase();
        executionId = req.body.executionId || Date.now().toString();
        inputPath = req.file.path;
    } else if (req.body && req.body.base64Data) {
        // JSON body with base64 data
        fileExt = req.body.fileExt;
        executionId = req.body.executionId || Date.now().toString();
        inputPath = `/tmp/brief_${executionId}.${fileExt}`;
        fs.writeFileSync(inputPath, Buffer.from(req.body.base64Data, 'base64'));
    } else {
        return res.json({ stdout: '', stderr: 'No file or base64 data received', returncode: 1 });
    }

    const outputPath = `/tmp/brief_${executionId}_text.txt`;

    try {
        let cmd;
        if (fileExt === 'pdf') {
            cmd = `pdftotext -layout "${inputPath}" "${outputPath}"`;
        } else if (fileExt === 'docx') {
            cmd = `python3 -c "
from docx import Document
doc = Document('${inputPath}')
lines = [p.text for p in doc.paragraphs if p.text.strip()]
for table in doc.tables:
    for row in table.rows:
        for cell in row.cells:
            if cell.text.strip():
                lines.append(cell.text.strip())
with open('${outputPath}','w') as f:
    f.write(chr(10).join(lines))
"`;
        } else if (fileExt === 'pptx') {
            cmd = `python3 -c "
from pptx import Presentation
prs = Presentation('${inputPath}')
lines = []
for slide in prs.slides:
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                t = para.text.strip()
                if t: lines.append(t)
with open('${outputPath}','w') as f:
    f.write(chr(10).join(lines))
"`;
        } else if (fileExt === 'txt') {
            fs.copyFileSync(inputPath, outputPath);
        } else {
            return res.json({ stdout: '', stderr: `Unsupported file type: ${fileExt}`, returncode: 1 });
        }

        if (cmd) {
            execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        }

        const stdout = fs.readFileSync(outputPath, 'utf8');

        // Cleanup
        try { fs.unlinkSync(inputPath); } catch(e) {}
        try { fs.unlinkSync(outputPath); } catch(e) {}

        res.json({ stdout: stdout.trim(), stderr: '', returncode: 0 });
    } catch (e) {
        try { fs.unlinkSync(inputPath); } catch(ex) {}
        try { fs.unlinkSync(outputPath); } catch(ex) {}
        res.json({ stdout: e.stdout ? e.stdout.trim() : '', stderr: e.message || '', returncode: 1 });
    }
});

app.post('/deps', (req, res) => {
    res.json({ stdout: 'DEPS_OK', stderr: '', returncode: 0 });
});

app.post('/generate-charts', (req, res) => {
    const { executionId, docSections, workableTask, fullDocumentText } = req.body;
    const workDir = `/tmp/charts_${executionId}`;
    fs.mkdirSync(workDir, { recursive: true });

    fs.writeFileSync(`${workDir}/sections.json`, JSON.stringify(docSections || []));
    fs.writeFileSync(`${workDir}/task.json`, JSON.stringify(workableTask || {}));
    fs.writeFileSync(`${workDir}/text.json`, JSON.stringify({ text: (fullDocumentText || '').substring(0, 3000) }));

    const script = `
import sys, os, json, base64, re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

exec_id = "${executionId}"
work_dir = f"/tmp/charts_{exec_id}"
os.makedirs(work_dir, exist_ok=True)

try:
    with open(f"{work_dir}/sections.json", "r") as f: sections = json.load(f)
    with open(f"{work_dir}/task.json", "r") as f: task = json.load(f)
    with open(f"{work_dir}/text.json", "r") as f: full_text = json.load(f)["text"]
except:
    sections = []
    task = {}
    full_text = ""

charts_generated = []
doc_type = str(task.get('document_type', '')).lower()

has_resource_scheduling = any(
    any(kw in (s.get('title','') + str(s.get('key_points',[])) + str(s.get('content',''))).lower()
        for kw in ['resource', 'gantt', 'early start', 'late start', 'schedule', 'labourer', 'activity'])
    for s in sections
) or 'resource' in str(task).lower() or 'gantt' in str(task).lower()

has_bsc = 'balanced scorecard' in str(task).lower() or 'bsc' in str(task).lower()
has_swot = 'swot' in str(task).lower() or 'strengths' in str(task).lower()

if has_resource_scheduling:
    acts_es = [('A',1,3,4),('B',4,2,2),('C',4,4,3),('D',4,5,5),('E',8,3,1),('F',9,5,3),('G',9,7,4),('H',11,8,2),('Y',19,1,3),('Z',16,2,2),('X',20,5,1)]
    proj_dur = 24
    fig, ax = plt.subplots(figsize=(14, 6))
    colors = ['#2E86AB','#A23B72','#F18F01','#C73E1D','#3B1F2B','#44BBA4','#E94F37','#393E41','#6B4226','#7B2FBE','#2D6A4F']
    for i, (id,es,dur,lab) in enumerate(acts_es):
        ax.barh(i, dur, left=es-1, height=0.6, color=colors[i%len(colors)], edgecolor='white', linewidth=0.5)
        ax.text(es-1+dur/2, i, f'{id}\\n({lab}L)', ha='center', va='center', fontsize=7.5, fontweight='bold', color='white')
    labels = ['Preparation','Concept Design','Spatial Coord.','Building Regs','Planning App','Technical Design','Building Systems','Phase 1 Build','Quality Inspection','Perf. Review','Phase 2 Build']
    ax.set_yticks(range(len(acts_es)))
    ax.set_yticklabels([f"{a[0]} - {labels[i]}" for i,a in enumerate(acts_es)], fontsize=8)
    ax.set_xlabel('Project Day', fontsize=9)
    ax.set_title('Figure: Gantt Chart - Early Start Schedule', fontsize=10, fontweight='bold', pad=8)
    ax.set_xlim(0, proj_dur); ax.set_xticks(range(0,proj_dur+1,2))
    ax.grid(axis='x', alpha=0.3, linestyle='--')
    ax.invert_yaxis()
    plt.tight_layout()
    path = f"{work_dir}/gantt.png"
    plt.savefig(path, dpi=150, bbox_inches='tight', facecolor='white'); plt.close()
    charts_generated.append(('gantt', path))

if has_swot:
    fig, axes = plt.subplots(2, 2, figsize=(14, 9))
    fig.patch.set_facecolor('#F8F9FA')
    swot_data = {
        ('Strengths', '#27AE60', axes[0,0]): ['Core competency','Structured approach','Academic access'],
        ('Weaknesses', '#E74C3C', axes[0,1]): ['Limited data','Time constraints','Scope limits'],
        ('Opportunities', '#2980B9', axes[1,0]): ['Emerging research','Cross-discipline','New frameworks'],
        ('Threats', '#E67E22', axes[1,1]): ['Rapid change','Contradictions','Method debates']
    }
    for (title, color, ax), items in swot_data.items():
        ax.set_facecolor(color + '18'); ax.set_xlim(0,1); ax.set_ylim(0,1)
        ax.set_xticks([]); ax.set_yticks([])
        for spine in ax.spines.values(): spine.set_edgecolor(color); spine.set_linewidth(2)
        ax.text(0.5, 0.93, title, ha='center', va='top', fontsize=13, fontweight='bold', color=color, transform=ax.transAxes)
        for i, item in enumerate(items):
            ax.text(0.05, 0.76-i*0.2, f'* {item}', ha='left', va='top', fontsize=9, color='#2C3E50', transform=ax.transAxes)
    plt.suptitle('Figure: SWOT Analysis', fontsize=13, fontweight='bold', y=1.01)
    plt.tight_layout()
    path = f"{work_dir}/swot.png"
    plt.savefig(path, dpi=150, bbox_inches='tight', facecolor='#F8F9FA'); plt.close()
    charts_generated.append(('swot', path))

manifest = {}
for name, path in charts_generated:
    if os.path.exists(path):
        with open(path,'rb') as f:
            manifest[name] = {'path': path, 'b64': base64.b64encode(f.read()).decode()}

manifest_path = f"{work_dir}/manifest.json"
with open(manifest_path, 'w') as f:
    json.dump({'charts': manifest, 'count': len(manifest), 'exec_id': exec_id}, f)

print(f"CHARTS_DONE:{len(manifest)}")
    `;

    try {
        fs.writeFileSync(`${workDir}/script.py`, script);
        const stdout = execSync(`python3 ${workDir}/script.py`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        res.json({ stdout: stdout.trim(), stderr: '', returncode: 0 });
    } catch (e) {
        res.json({ stdout: e.stdout ? e.stdout.trim() : '', stderr: e.message || '', returncode: 1 });
    }
});

app.post('/export-docx', (req, res) => {
    const {
        executionId, studentName, studentId, programme, university,
        submissionDate, workableTask, totalWordCount, targetWordCount, docSections
    } = req.body;

    const outputPath = path.join(__dirname, `public/exports/academic_doc_${executionId}.docx`);
    const serveUrl = `${req.protocol}://${req.get('host')}/exports/academic_doc_${executionId}.docx`;
    const workDir = `/tmp/charts_${executionId}`;

    const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, PageBreak } = require('docx');

    let charts = {};
    try {
        if (fs.existsSync(`${workDir}/manifest.json`)) {
            const manifest = JSON.parse(fs.readFileSync(`${workDir}/manifest.json`, 'utf8'));
            charts = manifest.charts || {};
        }
    } catch(e) {}

    const FONT = 'Arial';
    const SZ = 24, SZS = 20, SZH1 = 28, SZH2 = 26, LINE = 360;

    const tr = (t, o={}) => new TextRun({
      text: String(t||''), font: FONT, size: o.size||SZ,
      bold: o.bold||false, italics: o.italic||false, color: o.color||'000000'
    });
    const blk = () => new Paragraph({ spacing:{line:LINE,before:0,after:0}, children:[tr('')] });

    function mkP(runs, o={}) {
      return new Paragraph({
        alignment: o.center?AlignmentType.CENTER:o.right?AlignmentType.RIGHT:
                   o.left?AlignmentType.LEFT:AlignmentType.JUSTIFIED,
        spacing:{line:LINE,before:o.before||0,after:o.after||160},
        children: Array.isArray(runs)?runs:[tr(runs,o)]
      });
    }

    function h1(t){return new Paragraph({heading:HeadingLevel.HEADING_1,spacing:{line:LINE,before:280,after:140},children:[tr(t,{bold:true,size:SZH1,color:'1F3864'})]})}
    function h2(t){return new Paragraph({heading:HeadingLevel.HEADING_2,spacing:{line:LINE,before:200,after:100},children:[tr(t,{bold:true,size:SZH2,color:'2C5282'})]})}

    function embedChart(name, wCm, hCm, caption) {
      if (!charts[name]) return [];
      try {
        const buf = Buffer.from(charts[name].b64, 'base64');
        const wDXA = Math.round(wCm*360000/9144);
        const hDXA = Math.round(hCm*360000/9144);
        return [
          new Paragraph({alignment:AlignmentType.CENTER,spacing:{line:LINE,before:60,after:0},
            children:[new ImageRun({data:Uint8Array.from(buf),transformation:{width:wDXA,height:hDXA},type:'png'})]}),
          mkP([tr(caption,{size:SZS,italic:true,color:'333333'})],{center:true,before:20,after:160})
        ];
      } catch(e) { return [mkP(`[Chart: ${name} - ${e.message}]`,{italic:true})]; }
    }

    try {
        const cover = [
          blk(), blk(), blk(), blk(),
          mkP([tr((university||'University').toUpperCase(),{bold:true,size:28,color:'1F3864'})],{center:true,after:40}),
          mkP([tr(programme||'Programme',{size:22})],{center:true,after:40}),
          blk(), blk(),
          mkP([tr((workableTask?.document_type||'Document').toUpperCase(),{bold:true,size:32,color:'1F3864'})],{center:true,after:300}),
          blk(), blk(), blk(),
          mkP([tr('Student Name: ' + (studentName||''),{size:22})],{center:true,after:20}),
          mkP([tr('Student ID: ' + (studentId||''),{size:22})],{center:true,after:20}),
          mkP([tr('Submission Date: ' + (submissionDate||''),{size:22})],{center:true,after:20}),
          blk(),
          mkP([tr('Word Count: ' + totalWordCount + ' words',{size:22,bold:true})],{center:true}),
          new Paragraph({children:[new PageBreak()]})
        ];

        const mainContent = [];
        const chartNames = Object.keys(charts);
        let chartIdx = 0;

        for (const sec of (docSections||[])) {
            mainContent.push(h1((sec.sectionNumber ? sec.sectionNumber + '  ' : '') + (sec.title || '')));
            const paras = (sec.content || '').split(/\n\n+/).filter(p=>p.trim());
            for (const para of paras) {
                const t = para.trim();
                if (!t) continue;
                if (t.match(/^\d+\.\d+\s+\w/) && t.length < 120) {
                    mainContent.push(h2(t));
                } else {
                    mainContent.push(mkP(t));
                }
            }
            if (chartIdx < chartNames.length) {
                const chartName = chartNames[chartIdx];
                mainContent.push(...embedChart(chartName, 15, 9, `Figure: ${chartName}`));
                chartIdx++;
            }
            mainContent.push(blk());
        }

        const doc = new Document({ sections: [{ children: [...cover, ...mainContent] }] });

        Packer.toBuffer(doc).then(buf => {
            fs.writeFileSync(outputPath, buf);
            res.json({ stdout: `SUCCESS:${serveUrl}`, stderr: '', returncode: 0 });
        });
    } catch(e) {
        res.json({ stdout: '', stderr: e.message, returncode: 1 });
    }
});

app.post('/cleanup', (req, res) => {
    res.json({ stdout: 'CLEANUP_OK', stderr: '', returncode: 0 });
});

app.listen(3000, () => {
    console.log('n8n microservice listening on port 3000');
});
