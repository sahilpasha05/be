const fs = require('fs');

const inputPath = '/Users/sahilsmbp/Desktop/n8n.json';
const outputPath = '/Users/sahilsmbp/Desktop/n8n-cloud-ready.json';

const wf = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const IP = 'https://be-q3nc.onrender.com';

// Convert Code nodes that need binary data into HTTP Request nodes
wf.nodes.forEach(node => {
    // --- 03 — Text Extraction: Convert to HTTP Request node ---
    if (node.name === '03 — Text Extraction') {
        node.type = 'n8n-nodes-base.httpRequest';
        node.typeVersion = 4.2;
        node.parameters = {
            method: 'POST',
            url: `${IP}/extract-text`,
            sendBody: true,
            contentType: 'multipart-form-data',
            bodyParameters: {
                parameters: [
                    {
                        parameterType: 'formBinaryData',
                        name: 'file',
                        inputDataFieldName: 'brief_file'
                    },
                    {
                        parameterType: 'formData',
                        name: 'fileExt',
                        value: '={{ $json.fileExt }}'
                    },
                    {
                        parameterType: 'formData',
                        name: 'executionId',
                        value: '={{ $json.executionId }}'
                    }
                ]
            },
            options: {
                timeout: 120000
            }
        };
    }

    // --- 02c — Shell Extract Supporting Docs: Convert to HTTP Request node ---
    if (node.name === '02c — Shell Extract Supporting Docs') {
        node.type = 'n8n-nodes-base.httpRequest';
        node.typeVersion = 4.2;
        node.parameters = {
            method: 'POST',
            url: `${IP}/extract-text`,
            sendBody: true,
            contentType: 'multipart-form-data',
            bodyParameters: {
                parameters: [
                    {
                        parameterType: 'formBinaryData',
                        name: 'file',
                        inputDataFieldName: '={{ $json.supportingFileKey }}'
                    },
                    {
                        parameterType: 'formData',
                        name: 'fileExt',
                        value: '={{ $json.supportingFileExt }}'
                    },
                    {
                        parameterType: 'formData',
                        name: 'executionId',
                        value: '={{ $execution.id }}'
                    }
                ]
            },
            options: {
                timeout: 120000
            }
        };
    }

    // --- 34b — Install Dependencies: simplify ---
    if (node.name === '34b — Install Dependencies' && node.type === 'n8n-nodes-base.code') {
        node.parameters.jsCode = `const input = $input.first().json;\nreturn [{ json: { ...input, stdout: 'DEPS_OK', returncode: 0 } }];`;
    }

    // --- 34c — Generate Charts: HTTP POST to Render ---
    if (node.name === '34c — Generate Charts (matplotlib)' && node.type === 'n8n-nodes-base.code') {
        node.parameters.jsCode = `const input = $input.first().json;
try {
  const result = await $helpers.httpRequest({
    method: 'POST',
    url: '${IP}/generate-charts',
    body: { executionId: input.executionId, docSections: input.docSections, workableTask: input.workableTask, fullDocumentText: (input.fullDocumentText || '').substring(0, 3000) },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000
  });
  return [{ json: { ...input, stdout: result.stdout || '', stderr: result.stderr || '', returncode: result.returncode || 0 } }];
} catch(e) {
  return [{ json: { ...input, stdout: '', stderr: e.message, returncode: 1 } }];
}`;
    }

    // --- 35 — Export DOCX: HTTP POST to Render ---
    if (node.name === '35 — Export DOCX' && node.type === 'n8n-nodes-base.code') {
        node.parameters.jsCode = `const input = $input.first().json;
try {
  const result = await $helpers.httpRequest({
    method: 'POST',
    url: '${IP}/export-docx',
    body: { executionId: input.executionId, studentName: input.studentName, studentId: input.studentId, programme: input.programme, university: input.university, submissionDate: input.submissionDate, workableTask: input.workableTask, totalWordCount: input.totalWordCount, targetWordCount: input.targetWordCount, docSections: input.docSections },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000
  });
  return [{ json: { ...input, stdout: result.stdout || '', stderr: result.stderr || '', returncode: result.returncode || 0 } }];
} catch(e) {
  return [{ json: { ...input, stdout: '', stderr: e.message, returncode: 1 } }];
}`;
    }

    // --- 39 — Cleanup: just pass through ---
    if (node.name === '39 — Cleanup Temp Files' && node.type === 'n8n-nodes-base.code') {
        node.parameters.jsCode = `const input = $input.first().json;\nreturn [{ json: { ...input, stdout: 'CLEANUP_OK', stderr: '', returncode: 0 } }];`;
    }
});

fs.writeFileSync(outputPath, JSON.stringify(wf, null, 2));
console.log('Successfully patched n8n.json -> n8n-cloud-ready.json (v3 - HTTP Request nodes for binary data)');
