import {
	App,
	FuzzySuggestModal,
	TFile,
	Notice,
	Editor,
	FuzzyMatch,
	SuggestModal,
	MetadataCache,
	Setting,
	Modal,
} from "obsidian";
import TaskProgressBarPlugin from "..";
import { buildIndentString } from "../utils";

/**
 * Modal for selecting a target file to move tasks to
 */
export class FileSelectionModal extends FuzzySuggestModal<TFile | string> {
	plugin: TaskProgressBarPlugin;
	editor: Editor;
	currentFile: TFile;
	taskLine: number;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		editor: Editor,
		currentFile: TFile,
		taskLine: number
	) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
		this.currentFile = currentFile;
		this.taskLine = taskLine;
		this.setPlaceholder("选择一个文件或输入创建新文件");
	}

	getItems(): (TFile | string)[] {
		// Get all markdown files
		const files = this.app.vault.getMarkdownFiles();

		// Filter out the current file
		const filteredFiles = files.filter(
			(file) => file.path !== this.currentFile.path
		);

		// Sort files by path
		filteredFiles.sort((a, b) => a.path.localeCompare(b.path));

		return filteredFiles;
	}

	getItemText(item: TFile | string): string {
		if (typeof item === "string") {
			return `创建新文件: ${item}`;
		}
		return item.path;
	}

	renderSuggestion(item: FuzzyMatch<TFile | string>, el: HTMLElement): void {
		const match = item.item;
		if (typeof match === "string") {
			el.createEl("div", { text: `创建新文件: ${match}` });
		} else {
			el.createEl("div", { text: match.path });
		}
	}

	onChooseItem(item: TFile | string, evt: MouseEvent | KeyboardEvent): void {
		if (typeof item === "string") {
			// Create a new file
			this.createNewFileWithTasks(item);
		} else {
			// Show modal to select insertion point in existing file
			new BlockSelectionModal(
				this.app,
				this.plugin,
				this.editor,
				this.currentFile,
				item,
				this.taskLine
			).open();
		}
	}

	// If the query doesn't match any existing files, add an option to create a new file
	getSuggestions(query: string): FuzzyMatch<TFile | string>[] {
		const suggestions = super.getSuggestions(query);

		if (
			query &&
			!suggestions.some(
				(match) =>
					typeof match.item === "string" && match.item === query
			)
		) {
			// Check if it's a valid file path
			if (this.isValidFileName(query)) {
				// Add option to create a new file with this name
				suggestions.push({
					item: query,
					match: { score: 1, matches: [] },
				} as FuzzyMatch<string>);
			}
		}

		// Limit results to 20 to avoid performance issues
		return suggestions.slice(0, 20);
	}

	private isValidFileName(name: string): boolean {
		// Basic validation for file names
		return name.length > 0 && !name.includes("/") && !name.includes("\\");
	}

	private async createNewFileWithTasks(fileName: string) {
		try {
			// Ensure file name has .md extension
			if (!fileName.endsWith(".md")) {
				fileName += ".md";
			}

			// Get task content
			const taskContent = this.getTaskWithChildren();

			// Reset indentation for new file (remove all indentation from tasks)
			const resetIndentContent = this.resetIndentation(taskContent);

			// Create file in the same folder as current file
			const folder = this.currentFile.parent;
			const filePath = folder ? `${folder.path}/${fileName}` : fileName;

			// Create the file
			const newFile = await this.app.vault.create(
				filePath,
				resetIndentContent
			);

			// Remove the task from the current file
			this.removeTaskFromCurrentFile();

			// Open the new file
			this.app.workspace.getLeaf().openFile(newFile);

			new Notice(`任务已移动到 ${fileName}`);
		} catch (error) {
			new Notice(`创建文件失败: ${error}`);
			console.error(error);
		}
	}

	private getTaskWithChildren(): string {
		const content = this.editor.getValue();
		const lines = content.split("\n");

		// Get the current task line
		const currentLine = lines[this.taskLine];
		const currentIndent = this.getIndentation(currentLine);

		// Include the current line and all child tasks
		const resultLines = [currentLine];

		// Look for child tasks (with more indentation)
		for (let i = this.taskLine + 1; i < lines.length; i++) {
			const line = lines[i];
			const lineIndent = this.getIndentation(line);

			// If indentation is less or equal to current task, we've exited the child tasks
			if (lineIndent <= currentIndent) {
				break;
			}

			resultLines.push(line);
		}

		return resultLines.join("\n");
	}

	private removeTaskFromCurrentFile() {
		const content = this.editor.getValue();
		const lines = content.split("\n");

		const currentIndent = this.getIndentation(lines[this.taskLine]);

		// Find the range of lines to remove
		let endLine = this.taskLine;
		for (let i = this.taskLine + 1; i < lines.length; i++) {
			const lineIndent = this.getIndentation(lines[i]);

			if (lineIndent <= currentIndent) {
				break;
			}

			endLine = i;
		}

		// Remove the lines
		const newContent = [
			...lines.slice(0, this.taskLine),
			...lines.slice(endLine + 1),
		].join("\n");

		this.editor.setValue(newContent);
	}

	private getIndentation(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}

	// New method to reset indentation for new files
	private resetIndentation(content: string): string {
		const lines = content.split("\n");

		// Find the minimum indentation in all lines
		let minIndent = Number.MAX_SAFE_INTEGER;
		for (const line of lines) {
			if (line.trim().length === 0) continue; // Skip empty lines
			const indent = this.getIndentation(line);
			minIndent = Math.min(minIndent, indent);
		}

		// If no valid minimum found, or it's already 0, return as is
		if (minIndent === Number.MAX_SAFE_INTEGER || minIndent === 0) {
			return content;
		}

		// Remove the minimum indentation from each line
		return lines
			.map((line) => {
				if (line.trim().length === 0) return line; // Keep empty lines unchanged
				return line.substring(minIndent);
			})
			.join("\n");
	}
}

// 任务迁移模式
export enum InsertMode {
	TOP = "top",
	BOTTOM = "bottom",
	AFTER_BLOCK = "afterBlock",
	AS_CHILD = "asChild",
	AS_SIBLING = "asSibling"
}

// 任务迁移标记设置
export interface MigrationMarkSettings {
	enabled: boolean;
	markType: "date" | "version" | "custom";
	customMark: string;
}

/**
 * Modal for selecting a block to insert after in the target file
 */
export class BlockSelectionModal extends SuggestModal<{
	id: string;
	text: string;
	level: number;
}> {
	plugin: TaskProgressBarPlugin;
	editor: Editor;
	sourceFile: TFile;
	targetFile: TFile;
	taskLine: number;
	metadataCache: MetadataCache;
	insertMode: InsertMode = InsertMode.AFTER_BLOCK;
	migrationMarkSettings: MigrationMarkSettings = {
		enabled: false,
		markType: "date",
		customMark: "",
	};

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		editor: Editor,
		sourceFile: TFile,
		targetFile: TFile,
		taskLine: number
	) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
		this.sourceFile = sourceFile;
		this.targetFile = targetFile;
		this.taskLine = taskLine;
		this.metadataCache = app.metadataCache;
		
		// 使用插件设置中的默认值
		this.insertMode = plugin.settings.taskMoveSettings.defaultInsertMode as InsertMode || InsertMode.AFTER_BLOCK;
		this.migrationMarkSettings = {
			enabled: plugin.settings.taskMoveSettings.enableMigrationMark,
			markType: plugin.settings.taskMoveSettings.defaultMarkType as "date" | "version" | "custom" || "date",
			customMark: plugin.settings.taskMoveSettings.defaultCustomMark,
		};
		
		this.setPlaceholder("选择插入位置或特殊选项");
	}

	async getSuggestions(
		query: string
	): Promise<{ id: string; text: string; level: number }[]> {
		// Get file content
		const fileContent = await this.app.vault.read(this.targetFile);
		const lines = fileContent.split("\n");

		// Get file cache to find headings and list items
		const fileCache = this.metadataCache.getFileCache(this.targetFile);

		let blocks: { id: string; text: string; level: number }[] = [];

		// 添加顶部和底部选项
		blocks.push({
			id: "special-top",
			text: "📝 插入到文件顶部",
			level: 0,
		});
		
		blocks.push({
			id: "special-bottom",
			text: "📝 插入到文件底部",
			level: 0,
		});

		// 添加插入模式选项
		blocks.push({
			id: "special-mode-child",
			text: "📝 作为子任务插入 (增加缩进)",
			level: 0,
		});
		
		blocks.push({
			id: "special-mode-sibling",
			text: "📝 作为同级任务插入 (保持缩进)",
			level: 0,
		});
		
		// 添加迁移标记选项
		blocks.push({
			id: "special-mark-settings",
			text: "📝 设置迁移标记 (日期、版本号等)",
			level: 0,
		});

		// Add an option to insert at the beginning of the file
		blocks.push({
			id: "beginning",
			text: "文件开头",
			level: 0,
		});

		// Add headings
		if (fileCache && fileCache.headings) {
			for (const heading of fileCache.headings) {
				const text = lines[heading.position.start.line];
				blocks.push({
					id: `heading-${heading.position.start.line}`,
					text: text,
					level: heading.level,
				});
			}
		}

		// Add list items
		if (fileCache && fileCache.listItems) {
			for (const listItem of fileCache.listItems) {
				const text = lines[listItem.position.start.line];
				blocks.push({
					id: `list-${listItem.position.start.line}`,
					text: text,
					level: this.getIndentation(text),
				});
			}
		}

		// Filter blocks based on query
		if (query) {
			blocks = blocks.filter((block) =>
				block.text.toLowerCase().includes(query.toLowerCase())
			);
		}

		// Limit results to 20 to avoid performance issues
		return blocks.slice(0, 20);
	}

	renderSuggestion(
		block: { id: string; text: string; level: number },
		el: HTMLElement
	) {
		// 特殊选项不应用缩进
		if (block.id.startsWith("special-")) {
			el.createEl("div", { text: block.text });
			return;
		}
		
		const indent = "  ".repeat(block.level);

		if (block.id === "beginning") {
			el.createEl("div", { text: block.text });
		} else {
			el.createEl("div", { text: `${indent}${block.text}` });
		}
	}

	onChooseSuggestion(
		block: { id: string; text: string; level: number },
		evt: MouseEvent | KeyboardEvent
	) {
		// 处理特殊选项
		if (block.id === "special-top") {
			this.insertMode = InsertMode.TOP;
			this.moveTaskToTargetFile({ id: "beginning", text: "", level: 0 });
			return;
		} 
		else if (block.id === "special-bottom") {
			this.insertMode = InsertMode.BOTTOM;
			this.moveTaskToTargetFile({ id: "bottom", text: "", level: 0 });
			return;
		}
		else if (block.id === "special-mode-child") {
			this.insertMode = InsertMode.AS_CHILD;
			this.close();
			new BlockSelectionModal(
				this.app,
				this.plugin,
				this.editor,
				this.sourceFile,
				this.targetFile,
				this.taskLine
			).open();
			return;
		}
		else if (block.id === "special-mode-sibling") {
			this.insertMode = InsertMode.AS_SIBLING;
			this.close();
			new BlockSelectionModal(
				this.app,
				this.plugin,
				this.editor,
				this.sourceFile,
				this.targetFile,
				this.taskLine
			).open();
			return;
		}
		else if (block.id === "special-mark-settings") {
			this.close();
			new MigrationMarkModal(
				this.app, 
				this, 
				this.plugin
			).open();
			return;
		}
		
		this.moveTaskToTargetFile(block);
	}

	private async moveTaskToTargetFile(block: {
		id: string;
		text: string;
		level: number;
	}) {
		try {
			// Get task content
			let taskContent = this.getTaskWithChildren();
			
			// 如果启用了迁移标记，添加标记
			if (this.migrationMarkSettings.enabled) {
				taskContent = this.addMigrationMark(taskContent);
			}

			// Read target file content
			const fileContent = await this.app.vault.read(this.targetFile);
			const lines = fileContent.split("\n");

			let insertPosition: number;
			let indentLevel: number = 0;

			if (this.insertMode === InsertMode.TOP || block.id === "beginning") {
				insertPosition = 0;
			} 
			else if (this.insertMode === InsertMode.BOTTOM || block.id === "bottom") {
				insertPosition = lines.length;
			}
			else {
				// Extract line number from block id
				const lineMatch = block.id.match(/-(\d+)$/);
				if (!lineMatch) {
					throw new Error("无效的块ID");
				}

				const lineNumber = parseInt(lineMatch[1]);
				insertPosition = lineNumber + 1;

				// Get indentation of the target block
				indentLevel = this.getIndentation(lines[lineNumber]);
				
				// 如果是作为子任务插入，增加缩进
				if (this.insertMode === InsertMode.AS_CHILD) {
					indentLevel += buildIndentString(this.app).length;
				}
			}

			// Adjust indentation of task content to match the target block
			const indentedTaskContent = this.adjustIndentation(
				taskContent,
				indentLevel
			);

			// Insert task at the position
			const newContent = [
				...lines.slice(0, insertPosition),
				indentedTaskContent,
				...lines.slice(insertPosition),
			].join("\n");

			// Update target file
			await this.app.vault.modify(this.targetFile, newContent);

			// Remove task from source file
			this.removeTaskFromSourceFile();

			// Open the target file
			this.app.workspace.getLeaf().openFile(this.targetFile);

			new Notice(`任务已移动到 ${this.targetFile.path}`);
		} catch (error) {
			new Notice(`移动任务失败: ${error}`);
			console.error(error);
		}
	}
	
	private addMigrationMark(taskContent: string): string {
		const lines = taskContent.split("\n");
		const firstLine = lines[0];
		let mark = "";
		
		// 基于标记类型生成标记
		if (this.migrationMarkSettings.markType === "date") {
			mark = `📅 ${new Date().toISOString().split('T')[0]}`;
		} else if (this.migrationMarkSettings.markType === "version") {
			mark = `🔖 v${new Date().toISOString().replace(/[-:T]/g, '').split('.')[0]}`;
		} else {
			mark = this.migrationMarkSettings.customMark;
		}
		
		// 在任务行末尾添加标记
		lines[0] = `${firstLine} ${mark}`;
		
		return lines.join("\n");
	}

	private getTaskWithChildren(): string {
		const content = this.editor.getValue();
		const lines = content.split("\n");

		// Get the current task line
		const currentLine = lines[this.taskLine];
		const currentIndent = this.getIndentation(currentLine);

		// Include the current line and all child tasks
		const resultLines = [currentLine];

		// Look for child tasks (with more indentation)
		for (let i = this.taskLine + 1; i < lines.length; i++) {
			const line = lines[i];
			const lineIndent = this.getIndentation(line);

			// If indentation is less or equal to current task, we've exited the child tasks
			if (lineIndent <= currentIndent) {
				break;
			}

			resultLines.push(line);
		}

		return resultLines.join("\n");
	}

	private adjustIndentation(
		taskContent: string,
		targetIndent: number
	): string {
		const lines = taskContent.split("\n");

		// Get the indentation of the first line
		const firstLineIndent = this.getIndentation(lines[0]);

		// Calculate the indentation difference
		const indentDiff = targetIndent - firstLineIndent;

		if (indentDiff === 0) {
			return taskContent;
		}

		// Adjust indentation for all lines
		const indentStr =
			indentDiff > 0
				? buildIndentString(this.app).repeat(indentDiff)
				: "";

		return lines
			.map((line) => {
				if (indentDiff > 0) {
					// Add indentation
					return indentStr + line;
				} else {
					// Remove indentation
					const currentIndent = this.getIndentation(line);
					const newIndent = Math.max(0, currentIndent + indentDiff);
					return (
						buildIndentString(this.app).repeat(newIndent) +
						line.substring(currentIndent)
					);
				}
			})
			.join("\n");
	}

	private removeTaskFromSourceFile() {
		const content = this.editor.getValue();
		const lines = content.split("\n");

		const currentIndent = this.getIndentation(lines[this.taskLine]);

		// Find the range of lines to remove
		let endLine = this.taskLine;
		for (let i = this.taskLine + 1; i < lines.length; i++) {
			const lineIndent = this.getIndentation(lines[i]);

			if (lineIndent <= currentIndent) {
				break;
			}

			endLine = i;
		}

		// Remove the lines
		const newContent = [
			...lines.slice(0, this.taskLine),
			...lines.slice(endLine + 1),
		].join("\n");

		this.editor.setValue(newContent);
	}

	private getIndentation(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}
}

/**
 * 迁移标记设置模态框
 */
export class MigrationMarkModal extends Modal {
	private blockSelectionModal: BlockSelectionModal;
	private plugin: TaskProgressBarPlugin;
	
	constructor(
		app: App, 
		blockSelectionModal: BlockSelectionModal,
		plugin: TaskProgressBarPlugin
	) {
		super(app);
		this.blockSelectionModal = blockSelectionModal;
		this.plugin = plugin;
	}
	
	onOpen() {
		const { contentEl } = this;
		
		contentEl.empty();
		contentEl.addClass("migration-mark-modal");
		
		contentEl.createEl("h2", { text: "设置迁移标记" });
		
		// 启用标记切换
		new Setting(contentEl)
			.setName("启用迁移标记")
			.setDesc("移动任务时添加标记（如日期、版本号等）")
			.addToggle(toggle => {
				toggle
					.setValue(this.blockSelectionModal.migrationMarkSettings.enabled)
					.onChange(value => {
						this.blockSelectionModal.migrationMarkSettings.enabled = value;
						// 刷新显示状态
						this.updateCustomMarkVisibility();
					});
			});
		
		// 标记类型选择
		new Setting(contentEl)
			.setName("标记类型")
			.setDesc("选择要添加的标记类型")
			.addDropdown(dropdown => {
				dropdown
					.addOption("date", "日期 (YYYY-MM-DD)")
					.addOption("version", "版本号")
					.addOption("custom", "自定义")
					.setValue(this.blockSelectionModal.migrationMarkSettings.markType)
					.onChange(value => {
						this.blockSelectionModal.migrationMarkSettings.markType = value as any;
						// 刷新显示状态
						this.updateCustomMarkVisibility();
					});
			});
		
		// 自定义标记输入
		const customMarkSetting = new Setting(contentEl)
			.setName("自定义标记")
			.setDesc("输入要添加的自定义标记内容")
			.addText(text => {
				text
					.setValue(this.blockSelectionModal.migrationMarkSettings.customMark)
					.onChange(value => {
						this.blockSelectionModal.migrationMarkSettings.customMark = value;
					});
			});
		
		// 预览
		let previewSetting = new Setting(contentEl)
			.setName("预览")
			.setDesc("任务行将显示如下:");
		
		const previewEl = contentEl.createEl("div", { cls: "migration-mark-preview" });
		previewEl.createEl("code", { text: "- [ ] 任务示例" });
		
		// 按钮
		new Setting(contentEl)
			.addButton(button => {
				button
					.setButtonText("确定")
					.setCta()
					.onClick(() => {
						this.close();
						// 重新打开块选择模态框
						this.blockSelectionModal.open();
					});
			})
			.addButton(button => {
				button
					.setButtonText("取消")
					.onClick(() => {
						// 重置标记设置
						this.blockSelectionModal.migrationMarkSettings = {
							enabled: false,
							markType: "date",
							customMark: "",
						};
						this.close();
						// 重新打开块选择模态框
						this.blockSelectionModal.open();
					});
			});
			
		// 初始化显示状态
		this.updateCustomMarkVisibility();
		this.updatePreview(previewEl);
		
		// 添加事件监听器更新预览
		this.blockSelectionModal.migrationMarkSettings.enabled && this.updatePreview(previewEl);
	}
	
	private updateCustomMarkVisibility() {
		// 获取自定义标记设置元素
		const customMarkSetting = this.contentEl.querySelector(".setting:nth-child(3)");
		
		if (customMarkSetting) {
			if (this.blockSelectionModal.migrationMarkSettings.enabled && 
				this.blockSelectionModal.migrationMarkSettings.markType === "custom") {
				(customMarkSetting as HTMLElement).style.display = "flex";
			} else {
				(customMarkSetting as HTMLElement).style.display = "none";
			}
		}
		
		// 更新预览
		const previewEl = this.contentEl.querySelector(".migration-mark-preview code");
		if (previewEl) {
			this.updatePreview(previewEl as HTMLElement);
		}
	}
	
	private updatePreview(previewEl: HTMLElement) {
		if (!this.blockSelectionModal.migrationMarkSettings.enabled) {
			previewEl.textContent = "- [ ] 任务示例";
			return;
		}
		
		let mark = "";
		
		if (this.blockSelectionModal.migrationMarkSettings.markType === "date") {
			mark = `📅 ${new Date().toISOString().split('T')[0]}`;
		} else if (this.blockSelectionModal.migrationMarkSettings.markType === "version") {
			mark = `🔖 v${new Date().toISOString().replace(/[-:T]/g, '').split('.')[0]}`;
		} else {
			mark = this.blockSelectionModal.migrationMarkSettings.customMark;
		}
		
		previewEl.textContent = `- [ ] 任务示例 ${mark}`;
	}
	
	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Command to move the current task to another file
 */
export function moveTaskCommand(
	checking: boolean,
	editor: Editor,
	plugin: TaskProgressBarPlugin
): boolean {
	// Get the current file
	const currentFile = plugin.app.workspace.getActiveFile();

	if (checking) {
		// If checking, return true if we're in a markdown file and cursor is on a task line
		if (!currentFile || currentFile.extension !== "md") {
			return false;
		}

		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);

		// Check if line is a task (contains "- [ ]")
		return line.match(/^\s*- \[[ x]\]/i) !== null;
	}

	// Execute the command
	if (!currentFile) {
		new Notice("未找到活动文件");
		return false;
	}

	const cursor = editor.getCursor();
	new FileSelectionModal(
		plugin.app,
		plugin,
		editor,
		currentFile,
		cursor.line
	).open();

	return true;
}
