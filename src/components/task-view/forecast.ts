import {
	App,
	Component,
	ExtraButtonComponent,
	Platform,
	setIcon,
} from "obsidian";
import { Task } from "../../utils/types/TaskIndex";
import { CalendarComponent } from "./calendar";
import { TaskListItemComponent } from "./listItem";
import { t } from "../../translations/helper";
import "../../styles/forecast.css";
import "../../styles/calendar.css";
import { TaskTreeItemComponent } from "./treeItem";
import { TaskListRendererComponent } from "./TaskList";
import TaskProgressBarPlugin from "../../index";

interface DateSection {
	title: string;
	date: Date;
	tasks: Task[];
	isExpanded: boolean;
	renderer?: TaskListRendererComponent;
}

export class ForecastComponent extends Component {
	// UI Elements
	public containerEl: HTMLElement;
	private forecastHeaderEl: HTMLElement;
	private settingsEl: HTMLElement;
	private calendarContainerEl: HTMLElement;
	private dueSoonContainerEl: HTMLElement;
	private taskContainerEl: HTMLElement;
	private taskListContainerEl: HTMLElement;
	private focusBarEl: HTMLElement;
	private titleEl: HTMLElement;
	private statsContainerEl: HTMLElement;

	private leftColumnEl: HTMLElement;
	private rightColumnEl: HTMLElement;

	// Child components
	private calendarComponent: CalendarComponent;
	private taskComponents: TaskListItemComponent[] = [];

	// State
	private allTasks: Task[] = [];
	private pastDueTasks: Task[] = [];
	private todayTasks: Task[] = [];
	private futureTasks: Task[] = [];
	private selectedDate: Date;
	private currentDate: Date;
	private dateSections: DateSection[] = [];
	private focusFilter: string | null = null;
	private windowFocusHandler: () => void;
	private isTreeView: boolean = false;
	private treeComponents: TaskTreeItemComponent[] = [];

	// Events
	public onTaskSelected: (task: Task) => void;
	public onTaskCompleted: (task: Task) => void;

	// Context menu
	public onTaskContextMenu: (event: MouseEvent, task: Task) => void;

	constructor(
		private parentEl: HTMLElement,
		private app: App,
		private plugin: TaskProgressBarPlugin
	) {
		super();
		// Initialize dates
		this.currentDate = new Date();
		this.currentDate.setHours(0, 0, 0, 0);
		this.selectedDate = new Date(this.currentDate);
	}

	onload() {
		// Create main container
		this.containerEl = this.parentEl.createDiv({
			cls: "forecast-container",
		});

		// Create content container for columns
		const contentContainer = this.containerEl.createDiv({
			cls: "forecast-content",
		});

		// Left column: create calendar section and due soon stats
		this.createLeftColumn(contentContainer);

		// Right column: create task sections by date
		this.createRightColumn(contentContainer);

		// Set up window focus handler
		this.windowFocusHandler = () => {
			// Update current date when window regains focus
			const newCurrentDate = new Date();
			newCurrentDate.setHours(0, 0, 0, 0);

			// Store previous current date for comparison
			const oldCurrentDate = new Date(this.currentDate);
			oldCurrentDate.setHours(0, 0, 0, 0);

			// Update current date
			this.currentDate = newCurrentDate;

			// Update the calendar's current date
			this.calendarComponent.setCurrentDate(this.currentDate);

			// Only update selected date if it's older than the new current date
			// and the selected date was previously on the current date
			const selectedDateTimestamp = new Date(this.selectedDate).setHours(
				0,
				0,
				0,
				0
			);
			const oldCurrentTimestamp = oldCurrentDate.getTime();
			const newCurrentTimestamp = newCurrentDate.getTime();

			// Check if selectedDate equals oldCurrentDate (was on "today")
			// and if the new current date is after the selected date
			if (
				selectedDateTimestamp === oldCurrentTimestamp &&
				selectedDateTimestamp < newCurrentTimestamp
			) {
				// Update selected date to the new current date
				this.selectedDate = new Date(newCurrentDate);
				// Update the calendar's selected date
				this.calendarComponent.selectDate(this.selectedDate);
			}
			// If the date hasn't changed (still the same day), don't refresh
			if (oldCurrentTimestamp === newCurrentTimestamp) {
				// Skip refreshing if it's still the same day
				return;
			}
			// Update tasks categorization and UI
			this.categorizeTasks();
			this.updateTaskStats();
			this.updateDueSoonSection();
			this.refreshDateSectionsUI();
		};

		// Register the window focus event
		this.registerDomEvent(window, "focus", this.windowFocusHandler);
	}

	private createForecastHeader() {
		this.forecastHeaderEl = this.taskContainerEl.createDiv({
			cls: "forecast-header",
		});

		if (Platform.isPhone) {
			this.forecastHeaderEl.createEl(
				"div",
				{
					cls: "forecast-sidebar-toggle",
				},
				(el) => {
					new ExtraButtonComponent(el)
						.setIcon("sidebar")
						.onClick(() => {
							this.toggleLeftColumnVisibility();
						});
				}
			);
		}

		// Title and task count
		const titleContainer = this.forecastHeaderEl.createDiv({
			cls: "forecast-title-container",
		});

		this.titleEl = titleContainer.createDiv({
			cls: "forecast-title",
			text: t("Forecast"),
		});

		const countEl = titleContainer.createDiv({
			cls: "forecast-count",
		});
		countEl.setText(t("0 tasks, 0 projects"));

		// View toggle and settings
		const actionsContainer = this.forecastHeaderEl.createDiv({
			cls: "forecast-actions",
		});

		// List/Tree toggle button
		const viewToggleBtn = actionsContainer.createDiv({
			cls: "view-toggle-btn",
		});
		setIcon(viewToggleBtn, "list");
		viewToggleBtn.setAttribute("aria-label", t("Toggle list/tree view"));

		this.registerDomEvent(viewToggleBtn, "click", () => {
			this.toggleViewMode();
		});

		// // Settings button
		// this.settingsEl = actionsContainer.createDiv({
		// 	cls: "forecast-settings",
		// });
		// setIcon(this.settingsEl, "settings");
	}

	private toggleViewMode() {
		this.isTreeView = !this.isTreeView;

		// Update toggle button icon
		const viewToggleBtn = this.forecastHeaderEl.querySelector(
			".view-toggle-btn"
		) as HTMLElement;
		if (viewToggleBtn) {
			setIcon(viewToggleBtn, this.isTreeView ? "git-branch" : "list");
		}

		// Update sections display
		this.refreshDateSectionsUI();
	}

	private createFocusBar() {
		this.focusBarEl = this.taskContainerEl.createDiv({
			cls: "forecast-focus-bar",
		});

		const focusInput = this.focusBarEl.createEl("input", {
			cls: "focus-input",
			attr: {
				type: "text",
				placeholder: t("Focusing on Work"),
			},
		});

		const unfocusBtn = this.focusBarEl.createEl("button", {
			cls: "unfocus-button",
			text: t("Unfocus"),
		});

		this.registerDomEvent(unfocusBtn, "click", () => {
			focusInput.value = "";
		});
	}

	private createLeftColumn(parentEl: HTMLElement) {
		this.leftColumnEl = parentEl.createDiv({
			cls: "forecast-left-column",
		});

		if (Platform.isPhone) {
			// Add close button for mobile sidebar
			const closeBtn = this.leftColumnEl.createDiv({
				cls: "forecast-sidebar-close",
			});

			new ExtraButtonComponent(closeBtn).setIcon("x").onClick(() => {
				this.toggleLeftColumnVisibility(false);
			});
		}

		// Stats bar for Past Due / Today / Future counts
		this.createStatsBar(this.leftColumnEl);

		// Calendar section
		this.calendarContainerEl = this.leftColumnEl.createDiv({
			cls: "forecast-calendar-section",
		});

		// Create and initialize calendar component
		this.calendarComponent = new CalendarComponent(
			this.calendarContainerEl
		);
		this.addChild(this.calendarComponent);
		this.calendarComponent.load();

		// Due Soon section below calendar
		this.createDueSoonSection(this.leftColumnEl);

		// Set up calendar events
		this.calendarComponent.onDateSelected = (date, tasks) => {
			// Create a new date object to ensure we're working with a clean date
			const selectedDate = new Date(date);
			selectedDate.setHours(0, 0, 0, 0);

			this.selectedDate = selectedDate;

			// Update the Coming Up section first
			this.updateDueSoonSection();
			// Then refresh the date sections in the right panel
			this.refreshDateSectionsUI();

			if (Platform.isPhone) {
				this.toggleLeftColumnVisibility(false);
			}
		};
	}

	private createStatsBar(parentEl: HTMLElement) {
		this.statsContainerEl = parentEl.createDiv({
			cls: "forecast-stats",
		});

		// Create stat items
		const createStatItem = (
			id: string,
			label: string,
			count: number,
			type: string
		) => {
			const statItem = this.statsContainerEl.createDiv({
				cls: `stat-item ${id}`,
			});

			const countEl = statItem.createDiv({
				cls: "stat-count",
				text: count.toString(),
			});

			const labelEl = statItem.createDiv({
				cls: "stat-label",
				text: label,
			});

			// Register click handler
			this.registerDomEvent(statItem, "click", () => {
				this.focusTaskList(type);

				if (Platform.isPhone) {
					this.toggleLeftColumnVisibility(false);
				}
			});

			return statItem;
		};

		// Create stats for past due, today, and future
		createStatItem("past-due", t("Past Due"), 0, "past-due");
		createStatItem("today", t("Today"), 1, "today");
		createStatItem("future", t("Future"), 2, "future");
	}

	private createDueSoonSection(parentEl: HTMLElement) {
		this.dueSoonContainerEl = parentEl.createDiv({
			cls: "forecast-due-soon-section",
		});

		// Due soon entries will be added when tasks are set
	}

	private createRightColumn(parentEl: HTMLElement) {
		this.taskContainerEl = parentEl.createDiv({
			cls: "forecast-right-column",
		});

		// Create header with project count and actions
		this.createForecastHeader();

		// Create focus filter bar
		// this.createFocusBar();

		this.taskListContainerEl = this.taskContainerEl.createDiv({
			cls: "forecast-task-list",
		});

		// Date sections will be added when tasks are set
	}

	public setTasks(tasks: Task[]) {
		this.allTasks = tasks;

		// Update header count
		this.updateHeaderCount();

		// Filter and categorize tasks
		this.categorizeTasks();

		// Update calendar with all tasks
		this.calendarComponent.setTasks(this.allTasks);

		// Update stats
		this.updateTaskStats();

		// Update due soon section
		this.updateDueSoonSection();

		// Calculate and render date sections for the right column
		this.calculateDateSections();
		this.renderDateSectionsUI();
	}

	private updateHeaderCount() {
		// Count actions (tasks) and unique projects
		const projectSet = new Set<string>();
		this.allTasks.forEach((task) => {
			if (task.project) {
				projectSet.add(task.project);
			}
		});

		const taskCount = this.allTasks.length;
		const projectCount = projectSet.size;

		// Update header
		const countEl = this.forecastHeaderEl.querySelector(".forecast-count");
		if (countEl) {
			countEl.textContent = `${taskCount} ${t(
				"tasks"
			)}, ${projectCount} ${t("project")}${
				projectCount !== 1 ? "s" : ""
			}`;
		}
	}

	private categorizeTasks() {
		// Use currentDate as today
		const today = new Date(this.currentDate);
		today.setHours(0, 0, 0, 0);
		const todayTimestamp = today.getTime();

		// Filter for incomplete tasks with due dates
		const tasksWithDueDates = this.allTasks.filter(
			(task) => task.dueDate !== undefined
		);

		// Split into past due, today, and future
		this.pastDueTasks = tasksWithDueDates.filter((task) => {
			// Ensure dueDate exists before creating Date object
			if (!task.dueDate) return false;
			const dueDate = new Date(task.dueDate);
			dueDate.setHours(0, 0, 0, 0); // Zero out time
			return dueDate.getTime() < todayTimestamp; // Compare zeroed dates
		});
		this.todayTasks = tasksWithDueDates.filter((task) => {
			if (!task.dueDate) return false;
			const dueDate = new Date(task.dueDate!);
			dueDate.setHours(0, 0, 0, 0);
			return dueDate.getTime() === todayTimestamp;
		});
		this.futureTasks = tasksWithDueDates.filter((task) => {
			if (!task.dueDate) return false;
			const dueDate = new Date(task.dueDate!);
			dueDate.setHours(0, 0, 0, 0); // Zero out time
			return dueDate.getTime() > todayTimestamp; // Compare zeroed dates
		});

		// Sort tasks by priority and then due date
		const sortTasksByPriorityAndDueDate = (tasks: Task[]) => {
			return tasks.sort((a, b) => {
				// First by priority (high to low)
				const priorityA = a.priority || 0;
				const priorityB = b.priority || 0;
				if (priorityA !== priorityB) {
					return priorityB - priorityA;
				}

				// Then by due date (early to late)
				return (a.dueDate || 0) - (b.dueDate || 0);
			});
		};

		this.pastDueTasks = sortTasksByPriorityAndDueDate(this.pastDueTasks);
		this.todayTasks = sortTasksByPriorityAndDueDate(this.todayTasks);
		this.futureTasks = sortTasksByPriorityAndDueDate(this.futureTasks);
	}

	private updateTaskStats() {
		// Update counts in stats bar
		const statItems = this.statsContainerEl.querySelectorAll(".stat-item");
		statItems.forEach((item) => {
			const countEl = item.querySelector(".stat-count");
			if (countEl) {
				if (item.classList.contains("past-due")) {
					countEl.textContent = this.pastDueTasks.length.toString();
				} else if (item.classList.contains("today")) {
					countEl.textContent = this.todayTasks.length.toString();
				} else if (item.classList.contains("future")) {
					countEl.textContent = this.futureTasks.length.toString();
				}
			}
		});
	}

	private updateDueSoonSection() {
		// Clear existing content
		this.dueSoonContainerEl.empty();

		// Use the current selected date as the starting point
		// Always create a new date object to avoid reference issues
		const baseDate = new Date(this.selectedDate);
		baseDate.setHours(0, 0, 0, 0);

		const dueSoonItems: { date: Date; tasks: Task[] }[] = [];

		// Process tasks due in the next 15 days from the selected date
		for (let i = 0; i < 15; i++) {
			const date = new Date(baseDate);
			date.setDate(date.getDate() + i);

			// Skip current day since it's shown in the stats bar
			if (i === 0) continue;

			const tasksForDay = this.getTasksForDate(date);
			if (tasksForDay.length > 0) {
				dueSoonItems.push({
					date: date,
					tasks: tasksForDay,
				});
			}
		}

		// Add a header
		const headerEl = this.dueSoonContainerEl.createDiv({
			cls: "due-soon-header",
		});
		headerEl.setText(t("Coming Up"));

		// Create entries for upcoming due tasks
		dueSoonItems.forEach((item) => {
			const itemEl = this.dueSoonContainerEl.createDiv({
				cls: "due-soon-item",
			});

			// Format the date
			const dateStr = this.formatDateForDueSoon(item.date);

			// Get day of week
			const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
				item.date.getDay()
			];

			const dateEl = itemEl.createDiv({
				cls: "due-soon-date",
			});
			dateEl.setText(`${dayOfWeek}, ${dateStr}`);

			const countEl = itemEl.createDiv({
				cls: "due-soon-count",
			});

			// Properly format the task count
			const taskCount = item.tasks.length;
			countEl.setText(
				`${taskCount} ${taskCount === 1 ? t("Task") : t("Tasks")}`
			);

			// Add click handler to select this date
			this.registerDomEvent(itemEl, "click", () => {
				this.calendarComponent.selectDate(item.date);
				this.selectedDate = item.date;
				this.refreshDateSectionsUI();

				if (Platform.isPhone) {
					this.toggleLeftColumnVisibility(false);
				}
			});
		});

		// Add empty state if needed
		if (dueSoonItems.length === 0) {
			const emptyEl = this.dueSoonContainerEl.createDiv({
				cls: "due-soon-empty",
			});
			emptyEl.setText(t("No upcoming tasks"));
		}
	}

	private formatDateForDueSoon(date: Date): string {
		const monthNames = [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		];
		return `${monthNames[date.getMonth()]} ${date.getDate()}`;
	}

	private calculateDateSections() {
		this.dateSections = [];

		// Today section
		if (this.todayTasks.length > 0) {
			this.dateSections.push({
				title: t("Today") + " — " + this.formatDate(this.currentDate),
				date: new Date(this.currentDate),
				tasks: this.todayTasks,
				isExpanded: true,
			});
		}

		// Future sections by date
		const dateMap = new Map<string, Task[]>();
		this.futureTasks.forEach((task) => {
			if (task.dueDate) {
				const date = new Date(task.dueDate);
				date.setHours(0, 0, 0, 0);
				// Use local date components for the key to avoid timezone shifts
				const dateKey = `${date.getFullYear()}-${String(
					date.getMonth() + 1
				).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

				if (!dateMap.has(dateKey)) {
					dateMap.set(dateKey, []);
				}

				dateMap.get(dateKey)!.push(task);
			}
		});

		// Sort dates and create sections
		const sortedDates = Array.from(dateMap.keys()).sort();

		sortedDates.forEach((dateKey) => {
			const date = new Date(dateKey);
			const tasks = dateMap.get(dateKey)!;

			const today = new Date(this.currentDate);
			today.setHours(0, 0, 0, 0);

			const dayDiff = Math.round(
				(date.getTime() - today.getTime()) / (1000 * 3600 * 24)
			);

			let title = this.formatDate(date);

			// Add a special title for tomorrow
			if (dayDiff === 1) {
				title = "Tomorrow, " + title;
			} else {
				const dayOfWeek = [
					"Sunday",
					"Monday",
					"Tuesday",
					"Wednesday",
					"Thursday",
					"Friday",
					"Saturday",
				][date.getDay()];
				title = `${dayOfWeek}, ${title}`;
			}

			this.dateSections.push({
				title: title,
				date: date,
				tasks: tasks,
				isExpanded: dayDiff <= 7, // Auto-expand next 7 days
			});
		});

		// Past due section (if any)
		if (this.pastDueTasks.length > 0) {
			this.dateSections.unshift({
				title: "Past Due",
				date: new Date(0), // Placeholder
				tasks: this.pastDueTasks,
				isExpanded: true,
			});
		}
	}

	private renderDateSectionsUI() {
		this.cleanupRenderers();

		if (this.dateSections.length === 0) {
			const emptyEl = this.taskListContainerEl.createDiv({
				cls: "forecast-empty-state",
			});
			emptyEl.setText(t("No tasks scheduled"));
			return;
		}

		this.dateSections.forEach((section) => {
			const sectionEl = this.taskListContainerEl.createDiv({
				cls: "task-date-section",
			});

			// Check if this section is overdue
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const sectionDate = new Date(section.date);
			sectionDate.setHours(0, 0, 0, 0);

			// Add 'overdue' class for past due sections
			if (
				sectionDate.getTime() < today.getTime() ||
				section.title === "Past Due"
			) {
				sectionEl.addClass("overdue");
			}

			// Section header
			const headerEl = sectionEl.createDiv({
				cls: "date-section-header",
			});

			// Expand/collapse toggle
			const toggleEl = headerEl.createDiv({
				cls: "section-toggle",
			});
			setIcon(
				toggleEl,
				section.isExpanded ? "chevron-down" : "chevron-right"
			);

			// Section title
			const titleEl = headerEl.createDiv({
				cls: "section-title",
			});
			titleEl.setText(section.title);

			// Task count badge
			const countEl = headerEl.createDiv({
				cls: "section-count",
			});
			countEl.setText(`${section.tasks.length}`);

			// Task container (initially hidden if collapsed)
			const taskListEl = sectionEl.createDiv({
				cls: "section-tasks",
			});

			if (!section.isExpanded) {
				taskListEl.hide();
			}

			// Register toggle event
			this.registerDomEvent(headerEl, "click", () => {
				section.isExpanded = !section.isExpanded;
				setIcon(
					toggleEl,
					section.isExpanded ? "chevron-down" : "chevron-right"
				);
				section.isExpanded ? taskListEl.show() : taskListEl.hide();
			});

			// Create and configure renderer for this section
			section.renderer = new TaskListRendererComponent(
				this,
				taskListEl,
				this.app,
				"forecast"
			);
			section.renderer.onTaskSelected = this.onTaskSelected;
			section.renderer.onTaskCompleted = this.onTaskCompleted;
			section.renderer.onTaskContextMenu = this.onTaskContextMenu;

			// Render tasks using the section's renderer
			section.renderer.renderTasks(
				section.tasks,
				this.isTreeView,
				t("No tasks for this section.")
			);
		});
	}

	private formatDate(date: Date): string {
		const months = [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December",
		];
		return `${
			months[date.getMonth()]
		} ${date.getDate()}, ${date.getFullYear()}`;
	}

	private focusTaskList(type: string) {
		// Clear previous focus
		const statItems = this.statsContainerEl.querySelectorAll(".stat-item");
		statItems.forEach((item) => item.classList.remove("active"));

		// Set new focus
		if (this.focusFilter === type) {
			// Toggle off if already selected
			this.focusFilter = null;
		} else {
			this.focusFilter = type;
			const activeItem = this.statsContainerEl.querySelector(
				`.stat-item.${type}`
			);
			if (activeItem) {
				activeItem.classList.add("active");
			}
		}

		// Update date sections based on filter
		if (this.focusFilter === "past-due") {
			this.dateSections = [
				{
					title: t("Past Due"),
					date: new Date(0),
					tasks: this.pastDueTasks,
					isExpanded: true,
				},
			];
		} else if (this.focusFilter === "today") {
			this.dateSections = [
				{
					title:
						t("Today") + " — " + this.formatDate(this.currentDate),
					date: new Date(this.currentDate),
					tasks: this.todayTasks,
					isExpanded: true,
				},
			];
		} else if (this.focusFilter === "future") {
			// Re-create all future sections
			this.calculateDateSections();
			// Filter out past due and today
			this.dateSections = this.dateSections.filter((section) => {
				const today = new Date(this.currentDate);
				today.setHours(0, 0, 0, 0);
				return section.date.getTime() > today.getTime();
			});
		} else {
			// No filter, show all sections
			this.calculateDateSections();
		}

		// Re-render the sections
		this.renderDateSectionsUI();
	}

	private refreshDateSectionsUI() {
		// Update sections based on selected date
		if (this.focusFilter) {
			// If there's a filter active, don't change the sections
			return;
		}

		this.cleanupRenderers();

		// Calculate the sections based on the new selectedDate
		this.calculateFilteredDateSections();

		// Render the newly calculated sections
		this.renderDateSectionsUI();
	}

	private calculateFilteredDateSections() {
		this.dateSections = [];

		const selectedTasks = this.getTasksForDate(this.selectedDate);

		// Section for the selected date
		if (selectedTasks.length > 0) {
			this.dateSections.push({
				title: this.formatDate(this.selectedDate),
				date: new Date(this.selectedDate),
				tasks: selectedTasks,
				isExpanded: true,
			});
		}

		// Add overdue section if applicable
		const today = new Date(this.currentDate);
		today.setHours(0, 0, 0, 0);
		const selectedDay = new Date(this.selectedDate);
		selectedDay.setHours(0, 0, 0, 0);
		if (
			selectedDay.getTime() >= today.getTime() &&
			this.pastDueTasks.length > 0
		) {
			this.dateSections.unshift({
				title: t("Past Due"),
				date: new Date(0),
				tasks: this.pastDueTasks,
				isExpanded: true,
			});
		}

		// Add future sections after the selected date
		const futureTasksAfterSelected = this.futureTasks.filter((task) => {
			if (!task.dueDate) return false;
			const taskDate = new Date(task.dueDate);
			taskDate.setHours(0, 0, 0, 0);
			const selectedDate = new Date(this.selectedDate);
			selectedDate.setHours(0, 0, 0, 0);
			return taskDate.getTime() > selectedDate.getTime();
		});
		const dateMap = new Map<string, Task[]>();
		futureTasksAfterSelected.forEach((task) => {
			if (task.dueDate) {
				const date = new Date(task.dueDate);
				date.setHours(0, 0, 0, 0);
				// Use local date components for the key to avoid timezone shifts
				const dateKey = `${date.getFullYear()}-${String(
					date.getMonth() + 1
				).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

				if (!dateMap.has(dateKey)) {
					dateMap.set(dateKey, []);
				}

				dateMap.get(dateKey)!.push(task);
			}
		});
		const sortedDates = Array.from(dateMap.keys()).sort();
		sortedDates.forEach((dateKey) => {
			const date = new Date(dateKey);
			const tasks = dateMap.get(dateKey)!;

			const selectedDate = new Date(this.selectedDate);
			selectedDate.setHours(0, 0, 0, 0);

			const dayDiff = Math.round(
				(date.getTime() - selectedDate.getTime()) / (1000 * 3600 * 24)
			);

			const dayOfWeek = [
				"Sunday",
				"Monday",
				"Tuesday",
				"Wednesday",
				"Thursday",
				"Friday",
				"Saturday",
			][date.getDay()];

			let title = `${dayOfWeek}, ${this.formatDate(date)}`;

			// Add a special title for tomorrow relative to selected date
			if (dayDiff === 1) {
				title = t("Tomorrow") + ", " + title;
			}

			this.dateSections.push({
				title: title,
				date: date,
				tasks: tasks,
				isExpanded: dayDiff <= 7, // Auto-expand next 7 days
			});
		});

		// If after all this, no sections exist (e.g., selected date has no tasks and no overdue/future)
		if (this.dateSections.length === 0) {
			// We'll handle the empty state message in renderDateSectionsUI
			// Optionally add a placeholder section or let render handle it.
		}
	}

	private getTasksForDate(date: Date): Task[] {
		if (!date) return [];

		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);

		const startTimestamp = startOfDay.getTime();

		return this.allTasks.filter((task) => {
			if (task.dueDate) {
				const dueDate = new Date(task.dueDate);
				dueDate.setHours(0, 0, 0, 0);
				return dueDate.getTime() === startTimestamp;
			}
			return false;
		});
	}

	public updateTask(updatedTask: Task) {
		// Update in the main list
		const taskIndex = this.allTasks.findIndex(
			(t) => t.id === updatedTask.id
		);
		if (taskIndex !== -1) {
			this.allTasks[taskIndex] = updatedTask;
		} else {
			this.allTasks.push(updatedTask); // Add if new
		}

		// Re-categorize tasks (past, today, future) as due date might have changed
		this.categorizeTasks();

		// Update dependent UI elements
		this.updateTaskStats();
		this.updateDueSoonSection();
		this.calendarComponent.setTasks(this.allTasks); // Update calendar markers

		// Find the specific section renderer where the task *should* be and update it
		// Or simply recalculate and re-render all sections
		this.calculateDateSections(); // Recalculate based on new categories
		this.renderDateSectionsUI(); // Re-render the UI
	}

	private cleanupRenderers() {
		this.dateSections.forEach((section) => {
			if (section.renderer) {
				this.removeChild(section.renderer);
				section.renderer = undefined;
			}
		});
		// Clear the container manually
		this.taskListContainerEl.empty();
	}

	onunload() {
		// Renderers are children, handled by Obsidian unload.
		// No need to manually remove DOM event listeners registered with this.registerDomEvent
		this.containerEl.empty();
		this.containerEl.remove();
	}

	// Toggle left column visibility with animation support
	private toggleLeftColumnVisibility(visible?: boolean) {
		if (visible === undefined) {
			// Toggle based on current state
			visible = !this.leftColumnEl.hasClass("is-visible");
		}

		if (visible) {
			this.leftColumnEl.addClass("is-visible");
			this.leftColumnEl.show();
		} else {
			this.leftColumnEl.removeClass("is-visible");

			// Wait for animation to complete before hiding
			setTimeout(() => {
				if (!this.leftColumnEl.hasClass("is-visible")) {
					this.leftColumnEl.hide();
				}
			}, 300); // Match CSS transition duration
		}
	}
}
