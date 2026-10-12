import * as vscode from "vscode";
import { getRepoStats, type RepoStats, type StatsOptions } from "./git.ts";
import type { API, Repository } from "./gitApi.ts";

const REFRESH_DELAY_MS = 300;

interface RepoWatch {
  readonly repository: Repository;
  readonly subscription: vscode.Disposable;
  timer?: ReturnType<typeof setTimeout>;
  running: boolean;
  dirty: boolean;
}

export class StatsTracker implements vscode.Disposable {
  private readonly git: API;
  private readonly log: vscode.LogOutputChannel;
  private readonly watches = new Map<string, RepoWatch>();
  private readonly stats = new Map<string, RepoStats>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChange = this.changeEmitter.event;

  constructor(git: API, log: vscode.LogOutputChannel) {
    this.git = git;
    this.log = log;
    this.disposables.push(
      this.changeEmitter,
      git.onDidOpenRepository((repository) => this.add(repository)),
      git.onDidCloseRepository((repository) => this.remove(repository)),
    );
    for (const repository of git.repositories) {
      this.add(repository);
    }
  }

  get all(): RepoStats[] {
    return [...this.stats.values()].sort((a, b) => a.root.localeCompare(b.root));
  }

  get repositoryCount(): number {
    return this.watches.size;
  }

  refreshAll(): void {
    for (const watch of this.watches.values()) {
      this.schedule(watch, 0);
    }
  }

  dispose(): void {
    for (const watch of this.watches.values()) {
      clearTimeout(watch.timer);
      watch.subscription.dispose();
    }
    this.watches.clear();
    vscode.Disposable.from(...this.disposables).dispose();
  }

  private add(repository: Repository): void {
    const key = repository.rootUri.fsPath;
    if (this.watches.has(key)) {
      return;
    }
    const watch: RepoWatch = { repository, subscription: repository.state.onDidChange(() => this.schedule(watch, REFRESH_DELAY_MS)), running: false, dirty: false };
    this.watches.set(key, watch);
    this.schedule(watch, 0);
  }

  private remove(repository: Repository): void {
    const key = repository.rootUri.fsPath;
    const watch = this.watches.get(key);
    if (watch) {
      clearTimeout(watch.timer);
      watch.subscription.dispose();
      this.watches.delete(key);
    }
    if (this.stats.delete(key) || watch) {
      this.changeEmitter.fire();
    }
  }

  private schedule(watch: RepoWatch, delay: number): void {
    clearTimeout(watch.timer);
    watch.timer = setTimeout(() => void this.run(watch), delay);
  }

  private async run(watch: RepoWatch): Promise<void> {
    if (watch.running) {
      watch.dirty = true;
      return;
    }
    watch.running = true;
    const key = watch.repository.rootUri.fsPath;
    try {
      do {
        watch.dirty = false;
        const stats = await getRepoStats(this.git.git.path, key, readOptions());
        if (this.watches.get(key) !== watch) {
          return;
        }
        this.stats.set(key, stats);
        this.changeEmitter.fire();
      } while (watch.dirty);
    } catch (error) {
      this.log.error(`Failed to compute line changes for ${key}:`, error);
    } finally {
      watch.running = false;
    }
  }
}

function readOptions(): StatsOptions {
  const config = vscode.workspace.getConfiguration("diffstat");
  return { includeUntracked: config.get("includeUntracked", true), splitStaged: config.get("splitStagedChanges", false) };
}
