import {
	App,
	Modal,
	Setting,
	TextComponent,
	ButtonComponent,
	Notice,
	moment,
	setIcon,
} from "obsidian";
import { t } from "../translations/helper";
import {
	CalendarSpecificConfig,
	KanbanSpecificConfig,
	GanttSpecificConfig,
	TwoColumnSpecificConfig,
	SpecificViewConfig,
	ViewConfig,
	ViewFilterRule,
	ViewMode,
	ForecastSpecificConfig,
	DateExistType,
	PropertyExistType,
	DEFAULT_SETTINGS,
	SortCriterion,
} from "../common/setting-definition";
import TaskProgressBarPlugin from "../index";
import { FolderSuggest } from "./AutoComplete";
import { attachIconMenu } from "./IconMenu";
import { ConfirmModal } from "./ConfirmModal";

export class ViewConfigModal extends Modal {
	private viewConfig: ViewConfig;
	private viewFilterRule: ViewFilterRule;
	private plugin: TaskProgressBarPlugin;
	private isCreate: boolean;
	private onSave: (config: ViewConfig, rules: ViewFilterRule) => void;
	private originalViewConfig: string;
	private originalViewFilterRule: string;
	private hasChanges: boolean = false;

	// References to input components to read values later
	private nameInput: TextComponent;
	private iconInput: TextComponent;
	private textContainsInput: TextComponent;
	private tagsIncludeInput: TextComponent;
	private tagsExcludeInput: TextComponent;
	private statusIncludeInput: TextComponent;
	private statusExcludeInput: TextComponent;
	private projectInput: TextComponent;
	private priorityInput: TextComponent; // Consider dropdown if fixed range
	private dueDateInput: TextComponent;
	private startDateInput: TextComponent;
	private scheduledDateInput: TextComponent;
	private pathIncludesInput: TextComponent;
	private pathExcludesInput: TextComponent;

	// TwoColumnView specific settings
	private taskPropertyKeyInput: TextComponent;
	private leftColumnTitleInput: TextComponent;
	private rightColumnTitleInput: TextComponent;
	private multiSelectTextInput: TextComponent;
	private emptyStateTextInput: TextComponent;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		initialViewConfig: ViewConfig | null, // Null for creating
		initialFilterRule: ViewFilterRule | null, // Null for creating
		onSave: (config: ViewConfig, rules: ViewFilterRule) => void
	) {
		super(app);
		this.plugin = plugin;
		this.isCreate = initialViewConfig === null;

		if (this.isCreate) {
			const newId = `custom_${Date.now()}`;
			this.viewConfig = {
				id: newId,
				name: t("New custom view"),
				icon: "list-plus",
				type: "custom",
				visible: true,
				hideCompletedAndAbandonedTasks: false,
				filterBlanks: false,
				sortCriteria: [], // Initialize sort criteria as an empty array
			};
			this.viewFilterRule = initialFilterRule || {}; // Start with empty rules or provided defaults
		} else {
			// Deep copy to avoid modifying original objects until save
			this.viewConfig = JSON.parse(JSON.stringify(initialViewConfig));
			this.viewFilterRule = JSON.parse(
				JSON.stringify(initialFilterRule || {})
			);

			// Make sure sortCriteria exists
			if (!this.viewConfig.sortCriteria) {
				this.viewConfig.sortCriteria = [];
			}
		}

		// Store original values for change detection
		this.originalViewConfig = JSON.stringify(this.viewConfig);
		this.originalViewFilterRule = JSON.stringify(this.viewFilterRule);

		this.onSave = onSave;
	}

	onOpen() {
		this.display();
	}

	private display() {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.toggleClass("task-genius-view-config-modal", true);

		const days = [
			{ value: -1, name: t("Locale Default") }, // Use -1 or undefined as sentinel
			{
				value: 0,
				name: new Intl.DateTimeFormat(window.navigator.language, {
					weekday: "long",
				}).format(new Date(2024, 0, 7)),
			}, // Monday
			{
				value: 1,
				name: new Intl.DateTimeFormat(window.navigator.language, {
					weekday: "long",
				}).format(new Date(2024, 0, 1)),
			}, // Tuesday
			{
				value: 2,
				name: new Intl.DateTimeFormat(window.navigator.language, {
					weekday: "long",
				}).format(new Date(2024, 0, 2)),
			}, // Wednesday
			{
				value: 3,
				name: new Intl.DateTimeFormat(window.navigator.language, {
					weekday: "long",
				}).format(new Date(2024, 0, 3)),
			}, // Thursday
			{
				value: 4,
				name: new Intl.DateTimeFormat(window.navigator.language, {
					weekday: "long",
				}).format(new Date(2024, 0, 4)),
			}, // Friday
			{
				value: 5,
				name: new Intl.DateTimeFormat(window.navigator.language, {
					weekday: "long",
				}).format(new Date(2024, 0, 5)),
			}, // Saturday
			{
				value: 6,
				name: new Intl.DateTimeFormat(window.navigator.language, {
					weekday: "long",
				}).format(new Date(2024, 0, 6)),
			}, // Sunday
		];

		this.titleEl.setText(
			this.isCreate
				? t("Create custom view")
				: t("Edit view: ") + this.viewConfig.name
		);

		// --- Basic View Settings ---
		new Setting(contentEl).setName(t("View Name")).addText((text) => {
			this.nameInput = text;
			text.setValue(this.viewConfig.name).setPlaceholder(
				t("My Custom Task View")
			);
			text.onChange(() => this.checkForChanges());
		});

		new Setting(contentEl)
			.setName(t("Icon name"))
			.setDesc(
				t(
					"Enter any Lucide icon name (e.g., list-checks, filter, inbox)"
				)
			)
			.addText((text) => {
				text.inputEl.hide();
				this.iconInput = text;
				text.setValue(this.viewConfig.icon).setPlaceholder("list-plus");
				text.onChange(() => this.checkForChanges());
			})
			.addButton((btn) => {
				try {
					btn.setIcon(this.viewConfig.icon);
				} catch (e) {
					console.error("Error setting icon:", e);
				}
				attachIconMenu(btn, {
					containerEl: this.modalEl,
					plugin: this.plugin,
					onIconSelected: (iconId) => {
						this.viewConfig.icon = iconId;
						this.checkForChanges();
						try {
							setIcon(btn.buttonEl, iconId);
						} catch (e) {
							console.error("Error setting icon:", e);
						}
						this.iconInput.setValue(iconId);
					},
				});
			});

		if (this.viewConfig.id === "calendar") {
			new Setting(contentEl)
				.setName(t("First day of week"))
				.setDesc(t("Overrides the locale default for calendar views."))
				.addDropdown((dropdown) => {
					days.forEach((day) => {
						dropdown.addOption(String(day.value), day.name);
					});

					let initialValue = -1; // Default to 'Locale Default'
					if (
						this.viewConfig.specificConfig?.viewType === "calendar"
					) {
						initialValue =
							(
								this.viewConfig
									.specificConfig as CalendarSpecificConfig
							).firstDayOfWeek ?? -1;
					}
					dropdown.setValue(String(initialValue));

					dropdown.onChange((value) => {
						const numValue = parseInt(value);
						const newFirstDayOfWeek =
							numValue === -1 ? undefined : numValue;

						if (
							!this.viewConfig.specificConfig ||
							this.viewConfig.specificConfig.viewType !==
								"calendar"
						) {
							this.viewConfig.specificConfig = {
								viewType: "calendar",
								firstDayOfWeek: newFirstDayOfWeek,
							};
						} else {
							(
								this.viewConfig
									.specificConfig as CalendarSpecificConfig
							).firstDayOfWeek = newFirstDayOfWeek;
						}
						this.checkForChanges();
					});
				});
		} else if (this.viewConfig.id === "kanban") {
			new Setting(contentEl)
				.setName(t("Group by"))
				.setDesc(
					t("Select which task property to use for creating columns")
				)
				.addDropdown((dropdown) => {
					dropdown
						.addOption("status", t("Status"))
						.addOption("priority", t("Priority"))
						.addOption("tags", t("Tags"))
						.addOption("project", t("Project"))
						.addOption("dueDate", t("Due Date"))
						.addOption("scheduledDate", t("Scheduled Date"))
						.addOption("startDate", t("Start Date"))
						.addOption("context", t("Context"))
						.addOption("filePath", t("File Path"))
						.setValue(
							(
								this.viewConfig
									.specificConfig as KanbanSpecificConfig
							)?.groupBy || "status"
						)
						.onChange((value) => {
							if (
								!this.viewConfig.specificConfig ||
								this.viewConfig.specificConfig.viewType !==
									"kanban"
							) {
								this.viewConfig.specificConfig = {
									viewType: "kanban",
									showCheckbox: true,
									hideEmptyColumns: false,
									defaultSortField: "priority",
									defaultSortOrder: "desc",
									groupBy: value as any,
								};
							} else {
								(
									this.viewConfig
										.specificConfig as KanbanSpecificConfig
								).groupBy = value as any;
							}
							this.checkForChanges();
							// Refresh the modal to show/hide custom columns settings
							this.display();
						});
				});

			new Setting(contentEl)
				.setName(t("Show checkbox"))
				.setDesc(t("Show a checkbox for each task in the kanban view."))
				.addToggle((toggle) => {
					toggle.setValue(
						(this.viewConfig.specificConfig as KanbanSpecificConfig)
							?.showCheckbox as boolean
					);
					toggle.onChange((value) => {
						if (
							!this.viewConfig.specificConfig ||
							this.viewConfig.specificConfig.viewType !== "kanban"
						) {
							this.viewConfig.specificConfig = {
								viewType: "kanban",
								showCheckbox: value,
								hideEmptyColumns: false,
								defaultSortField: "priority",
								defaultSortOrder: "desc",
								groupBy: "status",
							};
						} else {
							(
								this.viewConfig
									.specificConfig as KanbanSpecificConfig
							).showCheckbox = value;
						}
						this.checkForChanges();
					});
				});

			new Setting(contentEl)
				.setName(t("Hide empty columns"))
				.setDesc(t("Hide columns that have no tasks."))
				.addToggle((toggle) => {
					toggle.setValue(
						(this.viewConfig.specificConfig as KanbanSpecificConfig)
							?.hideEmptyColumns as boolean
					);
					toggle.onChange((value) => {
						if (
							!this.viewConfig.specificConfig ||
							this.viewConfig.specificConfig.viewType !== "kanban"
						) {
							this.viewConfig.specificConfig = {
								viewType: "kanban",
								showCheckbox: true,
								hideEmptyColumns: value,
								defaultSortField: "priority",
								defaultSortOrder: "desc",
								groupBy: "status",
							};
						} else {
							(
								this.viewConfig
									.specificConfig as KanbanSpecificConfig
							).hideEmptyColumns = value;
						}
						this.checkForChanges();
					});
				});

			new Setting(contentEl)
				.setName(t("Default sort field"))
				.setDesc(
					t("Default field to sort tasks by within each column.")
				)
				.addDropdown((dropdown) => {
					dropdown
						.addOption("priority", t("Priority"))
						.addOption("dueDate", t("Due Date"))
						.addOption("scheduledDate", t("Scheduled Date"))
						.addOption("startDate", t("Start Date"))
						.addOption("createdDate", t("Created Date"))
						.setValue(
							(
								this.viewConfig
									.specificConfig as KanbanSpecificConfig
							)?.defaultSortField || "priority"
						)
						.onChange((value) => {
							if (
								!this.viewConfig.specificConfig ||
								this.viewConfig.specificConfig.viewType !==
									"kanban"
							) {
								this.viewConfig.specificConfig = {
									viewType: "kanban",
									showCheckbox: true,
									hideEmptyColumns: false,
									defaultSortField: value as any,
									defaultSortOrder: "desc",
									groupBy: "status",
								};
							} else {
								(
									this.viewConfig
										.specificConfig as KanbanSpecificConfig
								).defaultSortField = value as any;
							}
							this.checkForChanges();
						});
				});

			new Setting(contentEl)
				.setName(t("Default sort order"))
				.setDesc(t("Default order to sort tasks within each column."))
				.addDropdown((dropdown) => {
					dropdown
						.addOption("asc", t("Ascending"))
						.addOption("desc", t("Descending"))
						.setValue(
							(
								this.viewConfig
									.specificConfig as KanbanSpecificConfig
							)?.defaultSortOrder || "desc"
						)
						.onChange((value) => {
							if (
								!this.viewConfig.specificConfig ||
								this.viewConfig.specificConfig.viewType !==
									"kanban"
							) {
								this.viewConfig.specificConfig = {
									viewType: "kanban",
									showCheckbox: true,
									hideEmptyColumns: false,
									defaultSortField: "priority",
									defaultSortOrder: value as any,
									groupBy: "status",
								};
							} else {
								(
									this.viewConfig
										.specificConfig as KanbanSpecificConfig
								).defaultSortOrder = value as any;
							}
							this.checkForChanges();
						});
				});

			// Custom columns configuration for non-status grouping
			const kanbanConfig = this.viewConfig
				.specificConfig as KanbanSpecificConfig;
			if (kanbanConfig?.groupBy && kanbanConfig.groupBy !== "status") {
				new Setting(contentEl)
					.setName(t("Custom Columns"))
					.setDesc(
						t(
							"Configure custom columns for the selected grouping property"
						)
					)
					.setHeading();

				const columnsContainer = contentEl.createDiv({
					cls: "kanban-columns-container",
				});

				const refreshColumnsList = () => {
					columnsContainer.empty();

					// Ensure customColumns exists
					if (!kanbanConfig.customColumns) {
						kanbanConfig.customColumns = [];
					}

					const columns = kanbanConfig.customColumns;

					if (columns.length === 0) {
						columnsContainer.createEl("p", {
							text: t(
								"No custom columns defined. Add columns below."
							),
							cls: "setting-item-description",
						});
					}

					columns.forEach((column, index) => {
						const columnSetting = new Setting(columnsContainer)
							.setClass("kanban-column-row")
							.addText((text) => {
								text.setValue(column.title)
									.setPlaceholder(t("Column Title"))
									.onChange((value) => {
										if (kanbanConfig.customColumns) {
											kanbanConfig.customColumns[
												index
											].title = value;
											this.checkForChanges();
										}
									});
							})
							.addText((text) => {
								text.setValue(column.value?.toString() || "")
									.setPlaceholder(t("Value"))
									.onChange((value) => {
										if (kanbanConfig.customColumns) {
											// Handle different value types based on groupBy
											let parsedValue:
												| string
												| number
												| null = value;
											if (
												kanbanConfig.groupBy ===
													"priority" &&
												value
											) {
												const numValue =
													parseInt(value);
												parsedValue = isNaN(numValue)
													? value
													: numValue;
											}
											kanbanConfig.customColumns[
												index
											].value = parsedValue;
											this.checkForChanges();
										}
									});
							});

						// Controls for reordering and deleting
						columnSetting.addExtraButton((button) => {
							button
								.setIcon("arrow-up")
								.setTooltip(t("Move Up"))
								.setDisabled(index === 0)
								.onClick(() => {
									if (
										index > 0 &&
										kanbanConfig.customColumns
									) {
										const item =
											kanbanConfig.customColumns.splice(
												index,
												1
											)[0];
										kanbanConfig.customColumns.splice(
											index - 1,
											0,
											item
										);
										// Update order values
										kanbanConfig.customColumns.forEach(
											(col, i) => {
												col.order = i;
											}
										);
										this.checkForChanges();
										refreshColumnsList();
									}
								});
						});
						columnSetting.addExtraButton((button) => {
							button
								.setIcon("arrow-down")
								.setTooltip(t("Move Down"))
								.setDisabled(index === columns.length - 1)
								.onClick(() => {
									if (
										index < columns.length - 1 &&
										kanbanConfig.customColumns
									) {
										const item =
											kanbanConfig.customColumns.splice(
												index,
												1
											)[0];
										kanbanConfig.customColumns.splice(
											index + 1,
											0,
											item
										);
										// Update order values
										kanbanConfig.customColumns.forEach(
											(col, i) => {
												col.order = i;
											}
										);
										this.checkForChanges();
										refreshColumnsList();
									}
								});
						});
						columnSetting.addExtraButton((button) => {
							button
								.setIcon("trash")
								.setTooltip(t("Remove Column"))
								.onClick(() => {
									if (kanbanConfig.customColumns) {
										kanbanConfig.customColumns.splice(
											index,
											1
										);
										// Update order values
										kanbanConfig.customColumns.forEach(
											(col, i) => {
												col.order = i;
											}
										);
										this.checkForChanges();
										refreshColumnsList();
									}
								});
							button.extraSettingsEl.addClass("mod-warning");
						});
					});

					// Button to add a new column
					new Setting(columnsContainer)
						.addButton((button) => {
							button
								.setButtonText(t("Add Column"))
								.setCta()
								.onClick(() => {
									if (!kanbanConfig.customColumns) {
										kanbanConfig.customColumns = [];
									}
									const newColumn = {
										id: `column_${Date.now()}`,
										title: t("New Column"),
										value: "",
										order: kanbanConfig.customColumns
											.length,
									};
									kanbanConfig.customColumns.push(newColumn);
									this.checkForChanges();
									refreshColumnsList();
								});
						})
						.addButton((button) => {
							button
								.setButtonText(t("Reset Columns"))
								.onClick(() => {
									if (kanbanConfig.customColumns) {
										kanbanConfig.customColumns = [];
										this.checkForChanges();
										refreshColumnsList();
									}
								});
						});
				};

				refreshColumnsList();
			}
		} else if (this.viewConfig.id === "forecast") {
			new Setting(contentEl)
				.setName(t("First day of week"))
				.setDesc(t("Overrides the locale default for forecast views."))
				.addDropdown((dropdown) => {
					days.forEach((day) => {
						dropdown.addOption(String(day.value), day.name);
					});

					let initialValue = -1; // Default to 'Locale Default'
					if (
						this.viewConfig.specificConfig?.viewType === "forecast"
					) {
						initialValue =
							(
								this.viewConfig
									.specificConfig as ForecastSpecificConfig
							).firstDayOfWeek ?? -1;
					}
					dropdown.setValue(String(initialValue));

					dropdown.onChange((value) => {
						const numValue = parseInt(value);
						const newFirstDayOfWeek =
							numValue === -1 ? undefined : numValue;

						if (
							!this.viewConfig.specificConfig ||
							this.viewConfig.specificConfig.viewType !==
								"forecast"
						) {
							this.viewConfig.specificConfig = {
								viewType: "forecast",
								firstDayOfWeek: newFirstDayOfWeek,
							};
						} else {
							(
								this.viewConfig
									.specificConfig as ForecastSpecificConfig
							).firstDayOfWeek = newFirstDayOfWeek;
						}
						this.checkForChanges();
					});
				});
		}

		// Two Column View specific config
		if (
			this.isCreate ||
			this.viewConfig.specificConfig?.viewType === "twocolumn"
		) {
			// For new views, add a "View Type" dropdown
			if (this.isCreate) {
				new Setting(contentEl)
					.setName(t("View type"))
					.setDesc(t("Select the type of view to create"))
					.addDropdown((dropdown) => {
						dropdown
							.addOption("standard", t("Standard view"))
							.addOption("twocolumn", t("Two column view"))
							.setValue(
								this.viewConfig.specificConfig?.viewType ===
									"twocolumn"
									? "twocolumn"
									: "standard"
							)
							.onChange((value) => {
								if (value === "twocolumn") {
									// Create a new TwoColumnSpecificConfig
									this.viewConfig.specificConfig = {
										viewType: "twocolumn",
										taskPropertyKey: "tags", // Default to tags
										leftColumnTitle: t("Items"),
										rightColumnDefaultTitle: t("Tasks"),
										multiSelectText: t("selected items"),
										emptyStateText: t("No items selected"),
									};
								} else {
									// Remove specificConfig if not needed
									delete this.viewConfig.specificConfig;
								}
								this.checkForChanges();

								// Refresh the modal to show/hide the two column specific settings
								this.display();
							});
					});
			}

			// Only show TwoColumn specific settings if the view type is twocolumn
			if (this.viewConfig.specificConfig?.viewType === "twocolumn") {
				new Setting(contentEl)
					.setName(t("Two column view settings"))
					.setHeading();

				// Task Property Key selector
				new Setting(contentEl)
					.setName(t("Group by task property"))
					.setDesc(
						t(
							"Select which task property to use for left column grouping"
						)
					)
					.addDropdown((dropdown) => {
						dropdown
							.addOption("tags", t("Tags"))
							.addOption("project", t("Project"))
							.addOption("priority", t("Priority"))
							.addOption("context", t("Context"))
							.addOption("status", t("Status"))
							.addOption("dueDate", t("Due Date"))
							.addOption("scheduledDate", t("Scheduled Date"))
							.addOption("startDate", t("Start Date"))
							.addOption("filePath", t("File Path"))
							.setValue(
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).taskPropertyKey || "tags"
							)
							.onChange((value) => {
								if (
									this.viewConfig.specificConfig?.viewType ===
									"twocolumn"
								) {
									(
										this.viewConfig
											.specificConfig as TwoColumnSpecificConfig
									).taskPropertyKey = value;

									// Set appropriate default titles based on the selected property
									if (!this.leftColumnTitleInput.getValue()) {
										let title = t("Items");
										switch (value) {
											case "tags":
												title = t("Tags");
												break;
											case "project":
												title = t("Projects");
												break;
											case "priority":
												title = t("Priorities");
												break;
											case "context":
												title = t("Contexts");
												break;
											case "status":
												title = t("Status");
												break;
											case "dueDate":
												title = t("Due Dates");
												break;
											case "scheduledDate":
												title = t("Scheduled Dates");
												break;
											case "startDate":
												title = t("Start Dates");
												break;
											case "filePath":
												title = t("Files");
												break;
										}
										this.leftColumnTitleInput.setValue(
											title
										);
										(
											this.viewConfig
												.specificConfig as TwoColumnSpecificConfig
										).leftColumnTitle = title;
									}

									this.checkForChanges();
								}
							});
					});

				// Left Column Title
				new Setting(contentEl)
					.setName(t("Left column title"))
					.setDesc(t("Title for the left column (items list)"))
					.addText((text) => {
						this.leftColumnTitleInput = text;
						text.setValue(
							(
								this.viewConfig
									.specificConfig as TwoColumnSpecificConfig
							).leftColumnTitle || t("Items")
						);
						text.onChange((value) => {
							if (
								this.viewConfig.specificConfig?.viewType ===
								"twocolumn"
							) {
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).leftColumnTitle = value;
								this.checkForChanges();
							}
						});
					});

				// Right Column Title
				new Setting(contentEl)
					.setName(t("Right column title"))
					.setDesc(
						t("Default title for the right column (tasks list)")
					)
					.addText((text) => {
						this.rightColumnTitleInput = text;
						text.setValue(
							(
								this.viewConfig
									.specificConfig as TwoColumnSpecificConfig
							).rightColumnDefaultTitle || t("Tasks")
						);
						text.onChange((value) => {
							if (
								this.viewConfig.specificConfig?.viewType ===
								"twocolumn"
							) {
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).rightColumnDefaultTitle = value;
								this.checkForChanges();
							}
						});
					});

				// Multi-select Text
				new Setting(contentEl)
					.setName(t("Multi-select Text"))
					.setDesc(t("Text to show when multiple items are selected"))
					.addText((text) => {
						this.multiSelectTextInput = text;
						text.setValue(
							(
								this.viewConfig
									.specificConfig as TwoColumnSpecificConfig
							).multiSelectText || t("selected items")
						);
						text.onChange((value) => {
							if (
								this.viewConfig.specificConfig?.viewType ===
								"twocolumn"
							) {
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).multiSelectText = value;
								this.checkForChanges();
							}
						});
					});

				// Empty State Text
				new Setting(contentEl)
					.setName(t("Empty state text"))
					.setDesc(t("Text to show when no items are selected"))
					.addText((text) => {
						this.emptyStateTextInput = text;
						text.setValue(
							(
								this.viewConfig
									.specificConfig as TwoColumnSpecificConfig
							).emptyStateText || t("No items selected")
						);
						text.onChange((value) => {
							if (
								this.viewConfig.specificConfig?.viewType ===
								"twocolumn"
							) {
								(
									this.viewConfig
										.specificConfig as TwoColumnSpecificConfig
								).emptyStateText = value;
								this.checkForChanges();
							}
						});
					});
			}
		}

		// --- Filter Rules ---
		new Setting(contentEl).setName(t("Filter Rules")).setHeading();

		new Setting(contentEl)
			.setName(t("Hide completed and abandoned tasks"))
			.setDesc(t("Hide completed and abandoned tasks in this view."))
			.addToggle((toggle) => {
				toggle.setValue(this.viewConfig.hideCompletedAndAbandonedTasks);
				toggle.onChange((value) => {
					this.viewConfig.hideCompletedAndAbandonedTasks = value;
					this.checkForChanges();
				});
			});

		new Setting(contentEl)
			.setName(t("Filter blanks"))
			.setDesc(t("Filter out blank tasks in this view."))
			.addToggle((toggle) => {
				toggle.setValue(this.viewConfig.filterBlanks);
				toggle.onChange((value) => {
					this.viewConfig.filterBlanks = value;
					this.checkForChanges();
				});
			});

		new Setting(contentEl)
			.setName(t("Text contains"))
			.setDesc(
				t(
					"Filter tasks whose content includes this text (case-insensitive)."
				)
			)
			.addText((text) => {
				this.textContainsInput = text;
				text.setValue(this.viewFilterRule.textContains || "");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Tags include"))
			.setDesc(t("Task must include ALL these tags (comma-separated)."))
			.addText((text) => {
				this.tagsIncludeInput = text;
				text.setValue(
					(this.viewFilterRule.tagsInclude || []).join(", ")
				).setPlaceholder("#important, #projectA");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Tags exclude"))
			.setDesc(
				t("Task must NOT include ANY of these tags (comma-separated).")
			)
			.addText((text) => {
				this.tagsExcludeInput = text;
				text.setValue(
					(this.viewFilterRule.tagsExclude || []).join(", ")
				).setPlaceholder("#waiting, #someday");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Project is"))
			.setDesc(t("Task must belong to this project (exact match)."))
			.addText((text) => {
				this.projectInput = text;
				text.setValue(this.viewFilterRule.project || "");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Priority is"))
			.setDesc(
				t(
					"Task must have this priority (e.g., 1, 2, 3). You can also use 'none' to filter out tasks without a priority."
				)
			)
			.addText((text) => {
				this.priorityInput = text;
				text.setValue(
					this.viewFilterRule.priority !== undefined
						? String(this.viewFilterRule.priority)
						: ""
				);
				text.setPlaceholder("1, 2, 3 or none");
				text.onChange(() => this.checkForChanges());
			});

		// --- Status Filters (Potentially complex, using simple text for now) ---
		new Setting(contentEl)
			.setName(t("Status include"))
			.setDesc(
				t(
					"Task status must be one of these (comma-separated markers, e.g., /,>)."
				)
			)
			.addText((text) => {
				this.statusIncludeInput = text;
				text.setValue(
					(this.viewFilterRule.statusInclude || []).join(",")
				).setPlaceholder("/.>");
				text.onChange(() => this.checkForChanges());
			});

		new Setting(contentEl)
			.setName(t("Status exclude"))
			.setDesc(
				t(
					"Task status must NOT be one of these (comma-separated markers, e.g., -,x)."
				)
			)
			.addText((text) => {
				this.statusExcludeInput = text;
				text.setValue(
					(this.viewFilterRule.statusExclude || []).join(",")
				).setPlaceholder("-,x");
				text.onChange(() => this.checkForChanges());
			});

		// --- Date Filters ---
		// TODO: Consider using a date picker component or Moment.js for relative dates
		const dateDesc = t(
			"Use YYYY-MM-DD or relative terms like 'today', 'tomorrow', 'next week', 'last month'."
		);
		new Setting(contentEl)
			.setName(t("Due date is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.dueDateInput = text;
				text.setValue(this.viewFilterRule.dueDate || "");
				text.onChange(() => this.checkForChanges());
			});
		new Setting(contentEl)
			.setName(t("Start date is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.startDateInput = text;
				text.setValue(this.viewFilterRule.startDate || "");
				text.onChange(() => this.checkForChanges());
			});
		new Setting(contentEl)
			.setName(t("Scheduled date is"))
			.setDesc(dateDesc)
			.addText((text) => {
				this.scheduledDateInput = text;
				text.setValue(this.viewFilterRule.scheduledDate || "");
				text.onChange(() => this.checkForChanges());
			});

		// --- Path Filters ---
		new Setting(contentEl)
			.setName(t("Path includes"))
			.setDesc(
				t(
					"Task must contain this path (case-insensitive). Separate multiple paths with commas."
				)
			)
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl, this.plugin);
				this.pathIncludesInput = text;
				text.setValue(this.viewFilterRule.pathIncludes || "");
				text.onChange(() => this.checkForChanges());
			});
		new Setting(contentEl)
			.setName(t("Path excludes"))
			.setDesc(
				t(
					"Task must NOT contain this path (case-insensitive). Separate multiple paths with commas."
				)
			)
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl, this.plugin);
				this.pathExcludesInput = text;
				text.setValue(this.viewFilterRule.pathExcludes || "");
				text.onChange(() => this.checkForChanges());
			});

		if (
			!["kanban", "gantt", "calendar"].includes(
				this.viewConfig.specificConfig?.viewType || ""
			)
		) {
			new Setting(contentEl)
				.setName(t("Sort Criteria"))
				.setDesc(
					t(
						"Define the order in which tasks should be sorted. Criteria are applied sequentially."
					)
				)
				.setHeading();

			const criteriaContainer = contentEl.createDiv({
				cls: "sort-criteria-container",
			});

			const refreshCriteriaList = () => {
				criteriaContainer.empty();

				// Ensure viewConfig.sortCriteria exists
				if (!this.viewConfig.sortCriteria) {
					this.viewConfig.sortCriteria = [];
				}

				const criteria = this.viewConfig.sortCriteria;

				if (criteria.length === 0) {
					criteriaContainer.createEl("p", {
						text: t(
							"No sort criteria defined. Add criteria below."
						),
						cls: "setting-item-description",
					});
				}

				criteria.forEach((criterion: SortCriterion, index: number) => {
					const criterionSetting = new Setting(criteriaContainer)
						.setClass("sort-criterion-row")
						.addDropdown((dropdown) => {
							dropdown
								.addOption("status", t("Status"))
								.addOption("priority", t("Priority"))
								.addOption("dueDate", t("Due Date"))
								.addOption("startDate", t("Start Date"))
								.addOption("scheduledDate", t("Scheduled Date"))
								.addOption("content", t("Content"))
								.setValue(criterion.field)
								.onChange((value: SortCriterion["field"]) => {
									if (this.viewConfig.sortCriteria) {
										this.viewConfig.sortCriteria[
											index
										].field = value;
										this.checkForChanges();
										this.checkForChanges();
									}
								});
						})
						.addDropdown((dropdown) => {
							dropdown
								.addOption("asc", t("Ascending"))
								.addOption("desc", t("Descending"))
								.setValue(criterion.order)
								.onChange((value: SortCriterion["order"]) => {
									if (this.viewConfig.sortCriteria) {
										this.viewConfig.sortCriteria[
											index
										].order = value;
										this.checkForChanges();
									}
								});
							// Add tooltips explaining what asc/desc means for each field type if possible
							if (criterion.field === "priority") {
								dropdown.selectEl.title = t(
									"Ascending: High -> Low -> None. Descending: None -> Low -> High"
								);
							} else if (
								[
									"dueDate",
									"startDate",
									"scheduledDate",
								].includes(criterion.field)
							) {
								dropdown.selectEl.title = t(
									"Ascending: Earlier -> Later -> None. Descending: None -> Later -> Earlier"
								);
							} else if (criterion.field === "status") {
								dropdown.selectEl.title = t(
									"Ascending respects status order (Overdue first). Descending reverses it."
								);
							} else {
								dropdown.selectEl.title = t(
									"Ascending: A-Z. Descending: Z-A"
								);
							}
						});

					// Controls for reordering and deleting
					criterionSetting.addExtraButton((button) => {
						button
							.setIcon("arrow-up")
							.setTooltip(t("Move Up"))
							.setDisabled(index === 0)
							.onClick(() => {
								if (index > 0 && this.viewConfig.sortCriteria) {
									const item =
										this.viewConfig.sortCriteria.splice(
											index,
											1
										)[0];
									this.viewConfig.sortCriteria.splice(
										index - 1,
										0,
										item
									);
									this.checkForChanges();
									refreshCriteriaList();
								}
							});
					});
					criterionSetting.addExtraButton((button) => {
						button
							.setIcon("arrow-down")
							.setTooltip(t("Move Down"))
							.setDisabled(index === criteria.length - 1)
							.onClick(() => {
								if (
									index < criteria.length - 1 &&
									this.viewConfig.sortCriteria
								) {
									const item =
										this.viewConfig.sortCriteria.splice(
											index,
											1
										)[0];
									this.viewConfig.sortCriteria.splice(
										index + 1,
										0,
										item
									);
									this.checkForChanges();
									refreshCriteriaList();
								}
							});
					});
					criterionSetting.addExtraButton((button) => {
						button
							.setIcon("trash")
							.setTooltip(t("Remove Criterion"))
							.onClick(() => {
								if (this.viewConfig.sortCriteria) {
									this.viewConfig.sortCriteria.splice(
										index,
										1
									);
									this.checkForChanges();
									refreshCriteriaList();
								}
							});
						// Add class to the container element of the extra button
						button.extraSettingsEl.addClass("mod-warning");
					});
				});

				// Button to add a new criterion
				new Setting(criteriaContainer)
					.addButton((button) => {
						button
							.setButtonText(t("Add Sort Criterion"))
							.setCta()
							.onClick(() => {
								const newCriterion: SortCriterion = {
									field: "status",
									order: "asc",
								};
								if (!this.viewConfig.sortCriteria) {
									this.viewConfig.sortCriteria = [];
								}
								this.viewConfig.sortCriteria.push(newCriterion);
								this.checkForChanges();
								refreshCriteriaList();
							});
					})
					.addButton((button) => {
						// Button to reset to defaults
						button
							.setButtonText(t("Reset to Defaults"))
							.onClick(() => {
								// Optional: Add confirmation dialog here
								this.viewConfig.sortCriteria = []; // Use spread to copy
								this.checkForChanges();
								refreshCriteriaList();
							});
					});
			};

			refreshCriteriaList();
		}

		new Setting(contentEl)
			.setName(t("Has due date"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("hasDate", t("Has date"))
					.addOption("noDate", t("No date"))
					.addOption("any", t("Any"))
					.setValue(this.viewFilterRule.hasDueDate || "any")
					.onChange((value) => {
						this.viewFilterRule.hasDueDate = value as DateExistType;
						this.checkForChanges();
					});
			});

		new Setting(contentEl)
			.setName(t("Has start date"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("hasDate", t("Has date"))
					.addOption("noDate", t("No date"))
					.addOption("any", t("Any"))
					.setValue(this.viewFilterRule.hasStartDate || "any")
					.onChange((value) => {
						this.viewFilterRule.hasStartDate =
							value as DateExistType;
						this.checkForChanges();
					});
			});

		new Setting(contentEl)
			.setName(t("Has scheduled date"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("hasDate", t("Has date"))
					.addOption("noDate", t("No date"))
					.addOption("any", t("Any"))
					.setValue(this.viewFilterRule.hasScheduledDate || "any")
					.onChange((value) => {
						this.viewFilterRule.hasScheduledDate =
							value as DateExistType;
						this.checkForChanges();
					});
			});

		new Setting(contentEl)
			.setName(t("Has created date"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("hasDate", t("Has date"))
					.addOption("noDate", t("No date"))
					.addOption("any", t("Any"))
					.setValue(this.viewFilterRule.hasCreatedDate || "any")
					.onChange((value) => {
						this.viewFilterRule.hasCreatedDate =
							value as DateExistType;
						this.checkForChanges();
					});
			});

		new Setting(contentEl)
			.setName(t("Has completed date"))
			.setDesc(t("Only show tasks that match the completed date."))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("hasDate", t("Has date"))
					.addOption("noDate", t("No date"))
					.addOption("any", t("Any"))
					.setValue(this.viewFilterRule.hasCompletedDate || "any")
					.onChange((value) => {
						this.viewFilterRule.hasCompletedDate =
							value as DateExistType;
						this.checkForChanges();
					});
			});

		new Setting(contentEl)
			.setName(t("Has recurrence"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("hasProperty", t("Has property"))
					.addOption("noProperty", t("No property"))
					.addOption("any", t("Any"))
					.setValue(this.viewFilterRule.hasRecurrence || "any")
					.onChange((value) => {
						this.viewFilterRule.hasRecurrence =
							value as PropertyExistType;
						this.checkForChanges();
					});
			});

		// --- First Day of Week ---

		// --- Action Buttons ---
		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText(t("Save"))
					.setCta()
					.onClick(() => {
						this.saveChanges();
					});
			})
			.addButton((button) => {
				button.setButtonText(t("Cancel")).onClick(() => {
					this.close();
				});
			});
	}

	private parseStringToArray(input: string): string[] {
		if (!input || input.trim() === "") return [];
		return input
			.split(",")
			.map((s) => s.trim())
			.filter((s) => s !== "");
	}

	private checkForChanges() {
		const currentConfig = JSON.stringify(this.viewConfig);
		const currentFilterRule = JSON.stringify(this.getCurrentFilterRule());
		this.hasChanges =
			currentConfig !== this.originalViewConfig ||
			currentFilterRule !== this.originalViewFilterRule;
	}

	private getCurrentFilterRule(): ViewFilterRule {
		const rules: ViewFilterRule = {};
		const textContains = this.textContainsInput?.getValue()?.trim();
		if (textContains) rules.textContains = textContains;

		const tagsInclude = this.parseStringToArray(
			this.tagsIncludeInput?.getValue() || ""
		);
		if (tagsInclude.length > 0) rules.tagsInclude = tagsInclude;

		const tagsExclude = this.parseStringToArray(
			this.tagsExcludeInput?.getValue() || ""
		);
		if (tagsExclude.length > 0) rules.tagsExclude = tagsExclude;

		const statusInclude = this.parseStringToArray(
			this.statusIncludeInput?.getValue() || ""
		);
		if (statusInclude.length > 0) rules.statusInclude = statusInclude;

		const statusExclude = this.parseStringToArray(
			this.statusExcludeInput?.getValue() || ""
		);
		if (statusExclude.length > 0) rules.statusExclude = statusExclude;

		const project = this.projectInput?.getValue()?.trim();
		if (project) rules.project = project;

		const priorityStr = this.priorityInput?.getValue()?.trim();
		if (priorityStr) rules.priority = priorityStr;

		const dueDate = this.dueDateInput?.getValue()?.trim();
		if (dueDate) rules.dueDate = dueDate;

		const startDate = this.startDateInput?.getValue()?.trim();
		if (startDate) rules.startDate = startDate;

		const scheduledDate = this.scheduledDateInput?.getValue()?.trim();
		if (scheduledDate) rules.scheduledDate = scheduledDate;

		// 保留日期存在性筛选设置
		if (this.viewFilterRule.hasDueDate)
			rules.hasDueDate = this.viewFilterRule.hasDueDate;
		if (this.viewFilterRule.hasStartDate)
			rules.hasStartDate = this.viewFilterRule.hasStartDate;
		if (this.viewFilterRule.hasScheduledDate)
			rules.hasScheduledDate = this.viewFilterRule.hasScheduledDate;
		if (this.viewFilterRule.hasCreatedDate)
			rules.hasCreatedDate = this.viewFilterRule.hasCreatedDate;
		if (this.viewFilterRule.hasCompletedDate)
			rules.hasCompletedDate = this.viewFilterRule.hasCompletedDate;
		if (this.viewFilterRule.hasRecurrence)
			rules.hasRecurrence = this.viewFilterRule.hasRecurrence;

		const pathIncludes = this.pathIncludesInput?.getValue()?.trim();
		if (pathIncludes) rules.pathIncludes = pathIncludes;

		const pathExcludes = this.pathExcludesInput?.getValue()?.trim();
		if (pathExcludes) rules.pathExcludes = pathExcludes;

		return rules;
	}

	private saveChanges() {
		// Update viewConfig
		this.viewConfig.name =
			this.nameInput.getValue().trim() || t("Unnamed View");
		this.viewConfig.icon = this.iconInput.getValue().trim() || "list";

		// Update viewFilterRule
		this.viewFilterRule = this.getCurrentFilterRule();

		// Reset change tracking state
		this.originalViewConfig = JSON.stringify(this.viewConfig);
		this.originalViewFilterRule = JSON.stringify(this.viewFilterRule);
		this.hasChanges = false;

		// Call the onSave callback
		this.onSave(this.viewConfig, this.viewFilterRule);
		this.close();
		new Notice(t("View configuration saved."));
	}

	close() {
		if (this.hasChanges) {
			new ConfirmModal(this.plugin, {
				title: t("Unsaved Changes"),
				message: t("You have unsaved changes. Save before closing?"),
				confirmText: t("Save"),
				cancelText: t("Cancel"),
				onConfirm: (confirmed: boolean) => {
					if (confirmed) {
						this.saveChanges();
						return;
					}
					super.close();
				},
			}).open();
		} else {
			super.close();
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	// 添加saveSettingsUpdate方法
	private saveSettingsUpdate() {
		this.checkForChanges();
	}
}
