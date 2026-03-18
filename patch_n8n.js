const fs = require('fs');

const inputPath = '/Users/sahilsmbp/Desktop/n8n.json';
const outputPath = '/Users/sahilsmbp/Desktop/n8n-cloud-ready.json';

const wf = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const IP = 'http://YOUR_VPS_IP:3000';

const codeMap = {
  "03 — Text Extraction": `
const input = $input.first().json;
const data = $input.first().binary.brief_file.data;
const body = {
  fileExt: $json.fileExt,
  executionId: $execution.id,
  base64Data: data
};
try {
  const result = await $helpers.httpRequest({
    method: 'POST',
    url: '${IP}/extract-text',
    body: body,
    json: true
  });
  return [{ json: { ...input, stdout: result.stdout, stderr: result.stderr, returncode: result.returncode } }];
} catch (e) {
  return [{ json: { ...input, stdout: '', stderr: e.message, returncode: 1 } }];
}
`,
  "02c — Shell Extract Supporting Docs": `
const input = $input.first().json;
const fileKey = $json.supportingFileKey;
const data = $input.first().binary[fileKey].data;
const body = {
  fileExt: $json.supportingFileExt,
  executionId: $execution.id,
  base64Data: data
};
try {
  const result = await $helpers.httpRequest({
    method: 'POST',
    url: '${IP}/extract-text',
    body: body,
    json: true
  });
  return [{ json: { ...input, stdout: result.stdout, stderr: result.stderr, returncode: result.returncode } }];
} catch(e) {
  return [{ json: { ...input, stdout: '', stderr: e.message, returncode: 1 } }];
}
`,
  "34b — Install Dependencies": `
const input = $input.first().json;
return [{ json: { ...input, stdout: 'DEPS_OK', returncode: 0 } }];
`,
  "34c — Generate Charts (matplotlib)": `
const input = $input.first().json;
try {
  const result = await $helpers.httpRequest({
    method: 'POST',
    url: '${IP}/generate-charts',
    body: Object.assign({}, input, { executionId: $json.executionId }),
    json: true
  });
  return [{ json: { ...input, stdout: result.stdout, stderr: result.stderr, returncode: result.returncode } }];
} catch(e) {
  return [{ json: { ...input, stdout: '', stderr: e.message, returncode: 1 } }];
}
`,
  "35 — Export DOCX": `
const input = $input.first().json;
try {
  const result = await $helpers.httpRequest({
    method: 'POST',
    url: '${IP}/export-docx',
    body: Object.assign({}, input, { executionId: $json.executionId }),
    json: true
  });
  return [{ json: { ...input, stdout: result.stdout, stderr: result.stderr, returncode: result.returncode } }];
} catch(e) {
  return [{ json: { ...input, stdout: '', stderr: e.message, returncode: 1 } }];
}
`,
  "39 — Cleanup Temp Files": `
const input = $input.first().json;
try {
  const result = await $helpers.httpRequest({
    method: 'POST',
    url: '${IP}/cleanup',
    body: { executionId: $json.executionId },
    json: true
  });
  return [{ json: { ...input, stdout: result.stdout, stderr: result.stderr, returncode: result.returncode } }];
} catch(e) {
  return [{ json: { ...input, stdout: '', stderr: e.message, returncode: 1 } }];
}
`
};

wf.nodes.forEach(node => {
    if (codeMap[node.name] && node.type === 'n8n-nodes-base.code') {
        node.parameters.jsCode = codeMap[node.name].trim();
    }
});

fs.writeFileSync(outputPath, JSON.stringify(wf, null, 2));
console.log('Successfully patched n8n.json -> n8n-cloud-ready.json');
