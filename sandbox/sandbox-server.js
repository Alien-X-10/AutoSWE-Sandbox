import express from 'express';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
app.use(express.json({ limit: '2mb' }));

async function runCloudCpp(source_code, stdin, expected_output) {
  const startTime = Date.now();
  const res = await fetch('https://wandbox.org/api/compile.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler: 'gcc-head',
      code: source_code,
      stdin: stdin,
      'compiler-option-raw': '-std=c++20\n-O2'
    })
  });

  const data = await res.json();
  const execution_time_ms = Date.now() - startTime;

  if (data.compiler_error) {
    return {
      passed: false,
      status: 'COMPILATION_ERROR',
      exit_code: 1,
      stdout: '',
      stderr: data.compiler_error,
      execution_time_ms: 0
    };
  }

  const exit_code = Number(data.status ?? 0);
  const stdout = data.program_output || '';
  const stderr = data.program_error || '';
  const passed = exit_code === 0 && stdout.trim() === expected_output.trim();

  return {
    passed,
    status: passed ? 'ACCEPTED' : exit_code !== 0 ? 'RUNTIME_ERROR' : 'WRONG_ANSWER',
    exit_code,
    stdout,
    stderr,
    execution_time_ms
  };
}

app.post('/api/v1/execute', async (req, res) => {
  const { source_code = '', stdin = '', expected_output = '' } = req.body;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoswe-'));
  const srcPath = path.join(tmpDir, 'solution.cpp');
  const binPath = path.join(tmpDir, process.platform === 'win32' ? 'solution.exe' : 'solution');
  const inputPath = path.join(tmpDir, 'input.txt');

  try {
    fs.writeFileSync(srcPath, source_code);
    fs.writeFileSync(inputPath, stdin);

    try {
      execSync(`g++ -std=c++20 -O3 "${srcPath}" -o "${binPath}"`, { timeout: 5000 });
    } catch (compileErr) {
      const errMsg = compileErr.stderr?.toString() || compileErr.message || '';
      // If g++ is not installed on Render host, fallback to cloud C++20 compiler
      if (errMsg.includes('not found') || errMsg.includes('is not recognized') || compileErr.code === 'ENOENT') {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        const cloudResult = await runCloudCpp(source_code, stdin, expected_output);
        return res.json(cloudResult);
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res.json({
        passed: false,
        status: 'COMPILATION_ERROR',
        exit_code: 1,
        stdout: '',
        stderr: errMsg,
        execution_time_ms: 0
      });
    }

    const startTime = Date.now();
    exec(`"${binPath}" < "${inputPath}"`, { timeout: 3000 }, (error, stdout, stderr) => {
      const execution_time_ms = Date.now() - startTime;
      const exit_code = error ? (error.code ?? -1) : 0;
      const passed = exit_code === 0 && stdout.trim() === expected_output.trim();

      let status = 'ACCEPTED';
      if (!passed) {
        status = exit_code !== 0 ? 'RUNTIME_ERROR' : 'WRONG_ANSWER';
      }

      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res.json({ passed, status, exit_code, stdout, stderr, execution_time_ms });
    });
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return res.status(500).json({ passed: false, status: 'SYSTEM_ERROR', stderr: err.message });
  }
});

const SANDBOX_PORT = process.env.SANDBOX_PORT || 8080;
const server = app.listen(SANDBOX_PORT, () => {
  console.log(`⚡ C++ Sandbox listening on http://localhost:${SANDBOX_PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`ℹ️ Port ${SANDBOX_PORT} already in use (external Docker/Node sandbox active).`);
  }
});


// import express from 'express';
// import { execSync, exec } from 'child_process';
// import fs from 'fs';
// import path from 'path';
// import os from 'os';

// const app = express();
// app.use(express.json({ limit: '2mb' }));

// app.post('/api/v1/execute', async (req, res) => {
//   const { source_code, stdin = '', expected_output = '' } = req.body;
//   const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoswe-'));
//   const srcPath = path.join(tmpDir, 'solution.cpp');
//   const binPath = path.join(tmpDir, 'solution.exe'); // use 'solution' on Linux/Mac
//   const inputPath = path.join(tmpDir, 'input.txt');

//   try {
//     fs.writeFileSync(srcPath, source_code);
//     fs.writeFileSync(inputPath, stdin);

//     // 1. Compile C++
//     try {
//       execSync(`g++ -std=c++20 -O3 "${srcPath}" -o "${binPath}"`, { timeout: 5000 });
//     } catch (compileErr) {
//       return res.json({
//         passed: false,
//         status: 'COMPILATION_ERROR',
//         exit_code: 1,
//         stdout: '',
//         stderr: compileErr.stderr?.toString() || compileErr.message,
//         execution_time_ms: 0
//       });
//     }

//     // 2. Execute binary with stdin
//     const startTime = Date.now();
//     exec(`"${binPath}" < "${inputPath}"`, { timeout: 3000 }, (error, stdout, stderr) => {
//       const execution_time_ms = Date.now() - startTime;
//       const exit_code = error ? (error.code ?? -1) : 0;
//       const cleanStdout = stdout.trim();
//       const cleanExpected = expected_output.trim();
//       const passed = (exit_code === 0 && cleanStdout === cleanExpected);

//       let status = 'ACCEPTED';
//       if (!passed) {
//         status = exit_code !== 0 ? 'RUNTIME_ERROR' : 'WRONG_ANSWER';
//       }

//       // Cleanup tmp dir
//       fs.rmSync(tmpDir, { recursive: true, force: true });

//       if (passed) {
//         fs.mkdirSync('./workspace', { recursive: true });
//         fs.writeFileSync('./workspace/verified_solution.cpp', source_code);
//       }

//       return res.json({
//         passed,
//         status,
//         exit_code,
//         stdout,
//         stderr,
//         execution_time_ms
//       });
//     });

//   } catch (err) {
//     fs.rmSync(tmpDir, { recursive: true, force: true });
//     return res.status(500).json({ passed: false, status: 'SYSTEM_ERROR', stderr: err.message });
//   }
// });

// app.listen(8080, () => console.log('Node.js Sandbox running on http://localhost:8080'));