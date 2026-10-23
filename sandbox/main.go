package main

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Request struct {
	Language       string `json:"language"`
	SourceCode     string `json:"source_code"`
	Stdin          string `json:"stdin"`
	ExpectedOutput string `json:"expected_output"`
}

type Response struct {
	Passed          bool   `json:"passed"`
	Status          string `json:"status"`
	ExitCode        int    `json:"exit_code"`
	Stdout          string `json:"stdout"`
	Stderr          string `json:"stderr"`
	ExecutionTimeMs int64  `json:"execution_time_ms"`
}

func executeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	tmpDir, err := os.MkdirTemp("", "autoswe-*")
	if err != nil {
		json.NewEncoder(w).Encode(Response{Status: "SYSTEM_ERROR", Stderr: err.Error()})
		return
	}
	defer os.RemoveAll(tmpDir)

	srcPath := filepath.Join(tmpDir, "solution.cpp")
	binPath := filepath.Join(tmpDir, "solution")
	inputPath := filepath.Join(tmpDir, "input.txt")

	os.WriteFile(srcPath, []byte(req.SourceCode), 0644)
	os.WriteFile(inputPath, []byte(req.Stdin), 0644)

	// Compile
	cmdCompile := exec.Command("g++", "-std=c++20", "-O3", srcPath, "-o", binPath)
	compileStderr, err := cmdCompile.CombinedOutput()
	if err != nil {
		json.NewEncoder(w).Encode(Response{
			Passed: false, Status: "COMPILATION_ERROR", ExitCode: 1, Stderr: string(compileStderr),
		})
		return
	}

	// Execute
	inputFile, _ := os.Open(inputPath)
	cmdRun := exec.Command(binPath)
	cmdRun.Stdin = inputFile
	var stdout, stderr strings.Builder
	cmdRun.Stdout = &stdout
	cmdRun.Stderr = &stderr

	runErr := cmdRun.Run()
	exitCode := 0
	if runErr != nil {
		if exitError, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			exitCode = -1
		}
	}

	cleanStdout := strings.TrimSpace(stdout.String())
	cleanExpected := strings.TrimSpace(req.ExpectedOutput)
	passed := (exitCode == 0 && cleanStdout == cleanExpected)

	status := "ACCEPTED"
	if !passed {
		if exitCode != 0 {
			status = "RUNTIME_ERROR"
		} else {
			status = "WRONG_ANSWER"
		}
	}

	json.NewEncoder(w).Encode(Response{
		Passed: passed, Status: status, ExitCode: exitCode,
		Stdout: stdout.String(), Stderr: stderr.String(), ExecutionTimeMs: 10,
	})
}

func main() {
	http.HandleFunc("/api/v1/execute", executeHandler)
	http.ListenAndServe(":8080", nil)
}