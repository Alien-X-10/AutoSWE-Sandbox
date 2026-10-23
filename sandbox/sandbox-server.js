import express from 'express';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/api/v1/execute', async (req, res) => {
  const { source_code, stdin = '', expected_output = '' } = req.body;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autoswe-'));
  const srcPath = path.join(tmpDir, 'solution.cpp');
  const binPath = path.join(tmpDir, 'solution.exe'); // use 'solution' on Linux/Mac
  const inputPath = path.join(tmpDir, 'input.txt');

  try {
    fs.writeFileSync(srcPath, source_code);
    fs.writeFileSync(inputPath, stdin);

    // 1. Compile C++
    try {
      execSync(`g++ -std=c++20 -O3 "${srcPath}" -o "${binPath}"`, { timeout: 5000 });
    } catch (compileErr) {
      return res.json({
        passed: false,
        status: 'COMPILATION_ERROR',
        exit_code: 1,
        stdout: '',
        stderr: compileErr.stderr?.toString() || compileErr.message,
        execution_time_ms: 0
      });
    }

    // 2. Execute binary with stdin
    const startTime = Date.now();
    exec(`"${binPath}" < "${inputPath}"`, { timeout: 3000 }, (error, stdout, stderr) => {
      const execution_time_ms = Date.now() - startTime;
      const exit_code = error ? (error.code ?? -1) : 0;
      const cleanStdout = stdout.trim();
      const cleanExpected = expected_output.trim();
      const passed = (exit_code === 0 && cleanStdout === cleanExpected);

      let status = 'ACCEPTED';
      if (!passed) {
        status = exit_code !== 0 ? 'RUNTIME_ERROR' : 'WRONG_ANSWER';
      }

      // Cleanup tmp dir
      fs.rmSync(tmpDir, { recursive: true, force: true });

      if (passed) {
        fs.mkdirSync('./workspace', { recursive: true });
        fs.writeFileSync('./workspace/verified_solution.cpp', source_code);
      }

      return res.json({
        passed,
        status,
        exit_code,
        stdout,
        stderr,
        execution_time_ms
      });
    });

  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return res.status(500).json({ passed: false, status: 'SYSTEM_ERROR', stderr: err.message });
  }
});

app.listen(8080, () => console.log('Node.js Sandbox running on http://localhost:8080'));