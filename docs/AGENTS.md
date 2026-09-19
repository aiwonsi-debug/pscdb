# Token Conservation & Extreme Efficiency Rules (Ponytail + Zero-Waste Protocol)

Apply these rules on every interaction across all projects:

## 1. Output Economy (Token Minimization)
- **Direct Output First:** Output the code diff, terminal command, or direct answer immediately. Omit conversational fluff, greetings, and pleasantries.
- **No Unrequested Essays:** Never generate tutorials, conceptual overviews, or architectural walkthroughs unless the user explicitly asks with "explain", "why", or "how does it work".
- **Format:** Code/command first, then at most 1-2 lines summarizing what changed.

## 2. Tool & Search Economy (Context Window Protection)
- **Targeted Line Views:** Never load full multi-thousand-line files. Always specify `StartLine` and `EndLine` with `view_file` to view only relevant blocks.
- **Selective Searches:** Use specific file globs and precise terms with `grep_search` and `find_by_name`. Do not dump broad directory listings.
- **Surgical Edits:** Use `replace_file_content` for surgical patches. Never rewrite entire multi-KB files just to change a few lines.
- **No Polling Loops:** Wait for task notifications reactively rather than running manual status polling loops.

## 3. The Ponytail Ladder (No Unneeded Code)
1. **YAGNI:** Skip speculative features and unnecessary scaffolding.
2. **Codebase Reuse:** Check for existing helpers and patterns before writing new ones.
3. **Stdlib & Native First:** Standard libraries and OS built-ins before third-party packages.
4. **Shortest Working Diff:** The most concise patch that addresses root cause is the right solution.

## 4. Memory & State Compactness
- When reading or updating JSON memory files (for example, `secretary_memory.json`), do not print out the full file contents in the chat response. Operational stock and team data are stored in Google Drive/Sheets; display only the relevant delta summary.
