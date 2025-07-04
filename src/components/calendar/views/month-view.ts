import { App, Component, debounce, moment } from "obsidian";
import { CalendarEvent } from "../index";
import { renderCalendarEvent } from "../rendering/event-renderer"; // Import the new renderer
import {
	CalendarSpecificConfig,
	getViewSettingOrDefault,
} from "../../../common/setting-definition"; // Import helper
import TaskProgressBarPlugin from "../../../index"; // Import plugin type for settings access
import { CalendarViewComponent, CalendarViewOptions } from "./base-view"; // Import base class and options type
import Sortable from "sortablejs";

/**
 * Renders the month view grid as a component.
 */
export class MonthView extends CalendarViewComponent {
	private currentDate: moment.Moment;
	private app: App; // Keep app reference if needed directly
	private plugin: TaskProgressBarPlugin; // Keep plugin reference if needed directly
	private sortableInstances: Sortable[] = []; // Store sortable instances for cleanup

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		containerEl: HTMLElement,
		private currentViewId: string,
		currentDate: moment.Moment,
		events: CalendarEvent[],
		options: CalendarViewOptions // Use the base options type
	) {
		super(plugin, app, containerEl, events, options); // Call base constructor
		this.app = app; // Still store app if needed directly
		this.plugin = plugin; // Still store plugin if needed directly
		this.currentDate = currentDate;
	}

	render(): void {
		// Get view settings, including the first day of the week override
		const viewConfig = this.plugin.settings.viewConfiguration.find(
			(v) => v.id === this.currentViewId
		)?.specificConfig as CalendarSpecificConfig; // Assuming 'calendar' view for settings lookup, adjust if needed
		const firstDayOfWeekSetting = viewConfig?.firstDayOfWeek;
		// Default to Sunday (0) if the setting is undefined, following 0=Sun, 1=Mon, ..., 6=Sat
		const effectiveFirstDay =
			firstDayOfWeekSetting === undefined ? 0 : firstDayOfWeekSetting;

		// 1. Calculate the date range for the grid using effective first day
		const startOfMonth = this.currentDate.clone().startOf("month");
		const endOfMonth = this.currentDate.clone().endOf("month");
		// Calculate grid start based on the week containing the start of the month, adjusted for the effective first day
		const gridStart = startOfMonth.clone().weekday(effectiveFirstDay - 7); // moment handles wrapping correctly
		// Calculate grid end based on the week containing the end of the month, adjusted for the effective first day
		let gridEnd = endOfMonth.clone().weekday(effectiveFirstDay + 6); // moment handles wrapping correctly

		// Ensure grid covers at least 6 weeks (42 days) for consistent layout
		// This logic should still work fine with custom start/end days
		if (gridEnd.diff(gridStart, "days") + 1 < 42) {
			// Add full weeks until at least 42 days are covered
			const daysToAdd = 42 - (gridEnd.diff(gridStart, "days") + 1);
			gridEnd.add(daysToAdd, "days");
		}

		this.containerEl.empty();
		this.containerEl.addClass("view-month"); // Add class for styling

		// 2. Add weekday headers, rotated according to effective first day
		const headerRow = this.containerEl.createDiv("calendar-weekday-header");
		const weekdays = moment.weekdaysShort(true); // Gets locale-aware short weekdays
		const rotatedWeekdays = [
			...weekdays.slice(effectiveFirstDay),
			...weekdays.slice(0, effectiveFirstDay),
		];
		rotatedWeekdays.forEach((day) => {
			const weekdayEl = headerRow.createDiv("calendar-weekday");
			weekdayEl.textContent = day;
		});

		// 3. Create day cells grid container
		const gridContainer = this.containerEl.createDiv("calendar-month-grid");
		const dayCells: { [key: string]: HTMLElement } = {}; // Store cells by date string 'YYYY-MM-DD'
		let currentDayIter = gridStart.clone();

		while (currentDayIter.isSameOrBefore(gridEnd, "day")) {
			const cell = gridContainer.createEl("div", {
				cls: "calendar-day-cell",
				attr: {
					"data-date": currentDayIter.format("YYYY-MM-DD"),
				},
			});
			const dateStr = currentDayIter.format("YYYY-MM-DD");
			dayCells[dateStr] = cell;

			// Add day number
			const dayNumberEl = cell.createDiv("calendar-day-number");
			dayNumberEl.textContent = currentDayIter.format("D");

			// Add styling classes
			if (!currentDayIter.isSame(this.currentDate, "month")) {
				cell.addClass("is-other-month");
			}
			if (currentDayIter.isSame(moment(), "day")) {
				cell.addClass("is-today");
			}
			// Weekend check might need adjustment depending on visual definition of weekend with custom start day
			if (currentDayIter.day() === 0 || currentDayIter.day() === 6) {
				// Sunday or Saturday
				cell.addClass("is-weekend");
			}

			// Add events container within the cell
			cell.createDiv("calendar-events-container"); // This is where events will be appended

			currentDayIter.add(1, "day");
		}

		// 4. Filter and Render Events into the appropriate cells (uses calculated gridStart/gridEnd)
		this.events.forEach((event) => {
			const eventStartMoment = moment(event.start).startOf("day");
			const gridEndMoment = gridEnd.clone().endOf("day"); // Ensure comparison includes full last day
			const gridStartMoment = gridStart.clone().startOf("day");

			// Ensure the event is relevant to the displayed grid dates
			if (
				eventStartMoment.isAfter(gridEndMoment) || // Starts after the grid ends
				(event.end &&
					moment(event.end).startOf("day").isBefore(gridStartMoment)) // Ends before the grid starts
			) {
				return; // Event is completely outside the current grid view
			}

			// --- Simplified logic: Only render event on its start date ---
			// Check if the event's start date is within the visible grid dates
			if (
				eventStartMoment.isSameOrAfter(gridStartMoment) &&
				eventStartMoment.isSameOrBefore(gridEndMoment)
			) {
				const dateStr = eventStartMoment.format("YYYY-MM-DD");
				const targetCell = dayCells[dateStr];
				if (targetCell) {
					const eventsContainer = targetCell.querySelector(
						".calendar-events-container"
					);
					if (eventsContainer) {
						// Render the event using the existing renderer
						const { eventEl, component } = renderCalendarEvent({
							event: event,
							viewType: "month", // Pass viewType consistently
							app: this.app,
							onEventClick: this.options.onEventClick,
							onEventHover: this.options.onEventHover,
							onEventContextMenu: this.options.onEventContextMenu,
							onEventComplete: this.options.onEventComplete,
						});
						this.addChild(component);
						eventsContainer.appendChild(eventEl);
					}
				}
			}
			// --- End of simplified logic ---
		});

		console.log(
			`Rendered Month View component from ${gridStart.format(
				"YYYY-MM-DD"
			)} to ${gridEnd.format(
				"YYYY-MM-DD"
			)} (First day: ${effectiveFirstDay})`
		);

		this.registerDomEvent(gridContainer, "click", (ev) => {
			const target = ev.target as HTMLElement;
			if (target.closest(".calendar-day-number")) {
				const dateStr = target
					.closest(".calendar-day-cell")
					?.getAttribute("data-date");
				if (this.options.onDayClick) {
					console.log("Day number clicked:", dateStr);
					this.options.onDayClick(ev, moment(dateStr).valueOf(), {
						behavior: "open-task-view",
					});
				}

				return;
			}
			if (target.closest(".calendar-day-cell")) {
				const dateStr = target
					.closest(".calendar-day-cell")
					?.getAttribute("data-date");
				if (this.options.onDayClick) {
					this.options.onDayClick(ev, moment(dateStr).valueOf(), {
						behavior: "open-quick-capture",
					});
				}
			}
		});

		this.registerDomEvent(gridContainer, "mouseover", (ev) => {
			this.debounceHover(ev);
		});

		// Initialize drag and drop functionality
		this.initializeDragAndDrop(dayCells);
	}

	// Update methods to allow changing data after initial render
	updateEvents(events: CalendarEvent[]): void {
		this.events = events;
		this.render(); // Re-render will pick up current settings
	}

	updateCurrentDate(date: moment.Moment): void {
		this.currentDate = date;
		this.render(); // Re-render will pick up current settings and date
	}

	private debounceHover = debounce((ev: MouseEvent) => {
		const target = ev.target as HTMLElement;
		if (target.closest(".calendar-day-cell")) {
			const dateStr = target
				.closest(".calendar-day-cell")
				?.getAttribute("data-date");
			if (this.options.onDayHover) {
				this.options.onDayHover(ev, moment(dateStr).valueOf());
			}
		}
	}, 200);

	/**
	 * Initialize drag and drop functionality for calendar events
	 */
	private initializeDragAndDrop(dayCells: { [key: string]: HTMLElement }): void {
		// Clean up existing sortable instances
		this.sortableInstances.forEach(instance => instance.destroy());
		this.sortableInstances = [];

		// Initialize sortable for each day's events container
		Object.entries(dayCells).forEach(([dateStr, dayCell]) => {
			const eventsContainer = dayCell.querySelector('.calendar-events-container') as HTMLElement;
			if (eventsContainer) {
				const sortableInstance = Sortable.create(eventsContainer, {
					group: 'calendar-events',
					animation: 150,
					ghostClass: 'calendar-event-ghost',
					dragClass: 'calendar-event-dragging',
					onEnd: (event) => {
						this.handleDragEnd(event, dateStr);
					}
				});
				this.sortableInstances.push(sortableInstance);
			}
		});
	}

	/**
	 * Handle drag end event to update task dates
	 */
	private async handleDragEnd(event: Sortable.SortableEvent, originalDateStr: string): Promise<void> {
		const eventEl = event.item;
		const eventId = eventEl.dataset.eventId;
		const targetContainer = event.to;
		const targetDateCell = targetContainer.closest('.calendar-day-cell');

		if (!eventId || !targetDateCell) {
			console.warn('Could not determine event ID or target date for drag operation');
			return;
		}

		const targetDateStr = targetDateCell.getAttribute('data-date');
		if (!targetDateStr || targetDateStr === originalDateStr) {
			// No date change, nothing to do
			return;
		}

		// Find the calendar event
		const calendarEvent = this.events.find(e => e.id === eventId);
		if (!calendarEvent) {
			console.warn(`Calendar event with ID ${eventId} not found`);
			return;
		}

		try {
			await this.updateTaskDate(calendarEvent, targetDateStr);
			console.log(`Task ${eventId} moved from ${originalDateStr} to ${targetDateStr}`);
		} catch (error) {
			console.error('Failed to update task date:', error);
			// Revert the visual change by re-rendering
			this.render();
		}
	}

	/**
	 * Update task date based on the target date
	 */
	private async updateTaskDate(calendarEvent: CalendarEvent, targetDateStr: string): Promise<void> {
		const targetDate = moment(targetDateStr).valueOf();
		const taskManager = this.plugin.taskManager;

		if (!taskManager) {
			throw new Error('Task manager not available');
		}

		// Create updated task with new date
		const updatedTask = { ...calendarEvent };

		// Determine which date field to update based on what the task currently has
		if (calendarEvent.dueDate) {
			updatedTask.dueDate = targetDate;
		} else if (calendarEvent.scheduledDate) {
			updatedTask.scheduledDate = targetDate;
		} else if (calendarEvent.startDate) {
			updatedTask.startDate = targetDate;
		} else {
			// Default to due date if no date is set
			updatedTask.dueDate = targetDate;
		}

		// Update the task
		await taskManager.updateTask(updatedTask);
	}

	/**
	 * Clean up sortable instances when component is destroyed
	 */
	onunload(): void {
		this.sortableInstances.forEach(instance => instance.destroy());
		this.sortableInstances = [];
		super.onunload();
	}
}
