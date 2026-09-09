import moment from "moment";
import Swal from "sweetalert2";
import VisitCard from "./VisitCard";
import { getToken } from "@/config/config";
import AppointmentCard from "./AppointmentCard";
import GraphQLAPI from "@/config/sub-apis/graphql.api";
import { createSwalToast } from "@/helper/swalHelpersV1";
import LoadingSpinner from "@/components/LoadingSpinner";
import React, { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import { useNavigate, useSearchParams } from "react-router-dom";

interface AppointmentCalendarViewProps {
	filters: any;
	setFilters: (filters: any) => void;
	applyFilters: (params: any) => void;
	onCreateAppointment?: (prefillData: any) => void;
	onMarkComplete?: (appointment: any) => void;
	onDeleteModal?: (appointment: any) => void;
	onEditModal?: (appointment: any) => void;
	refreshKey?: number;
	ownerId?: number | null;
}

type AppointmentStatusType = "All" | "Planned" | "Completed" | "Cancelled";
type CalendarViewMode = "weekly" | "monthly" | "agenda";
type CalendarItemType = "appointment" | "visit";

const CALENDAR_VIEW_MODES: readonly CalendarViewMode[] = ["weekly", "monthly", "agenda"];
const DEFAULT_VIEW_MODE: CalendarViewMode = "weekly";

function isCalendarViewMode(value: string | null): value is CalendarViewMode {
	return value !== null && (CALENDAR_VIEW_MODES as readonly string[]).includes(value);
}

const HOUR_HEIGHT_PX = 60;
const DAY_HEIGHT_PX = HOUR_HEIGHT_PX * 24;
const MIN_DURATION_MINUTES = 15;

const AppointmentCalendarView: React.FC<AppointmentCalendarViewProps> = ({
	filters,
	setFilters,
	onCreateAppointment,
	onMarkComplete,
	onDeleteModal,
	onEditModal,
	refreshKey,
	ownerId,
}) => {
	const graphqlApi = new GraphQLAPI();
	const navigate = useNavigate();
	const [selectedStatus, setSelectedStatus] = useState<AppointmentStatusType>("All");
	const [loading, setLoading] = useState(false);
	const [appointments, setAppointments] = useState<any[]>([]);
	const [visits, setVisits] = useState<any[]>([]);
	
	const isFetching = useRef(false);
	const [searchParams, setSearchParams] = useSearchParams();
	const userData = getToken("userData");

	// Drop preview: show a shadow in the target slot that reflects duration and layout of the new position
	const [draggingAppointment, setDraggingAppointment] = useState<{ id: number; duration_minutes: number } | null>(null);
	const [dropPreview, setDropPreview] = useState<{ dayKey: string; hour: number } | null>(null);

	useEffect(() => {
		if (!draggingAppointment) return;
		const onDragEnd = () => {
			setDraggingAppointment(null);
			setDropPreview(null);
		};
		document.addEventListener("dragend", onDragEnd, false);
		document.addEventListener("drop", onDragEnd, false);
		return () => {
			document.removeEventListener("dragend", onDragEnd);
			document.removeEventListener("drop", onDragEnd);
		};
	}, [draggingAppointment]);

	const viewFromUrl = searchParams.get("view");
	const [viewMode, setViewModeState] = useState<CalendarViewMode>(() =>
		isCalendarViewMode(viewFromUrl) ? viewFromUrl : DEFAULT_VIEW_MODE
	);

	const setViewMode = (mode: CalendarViewMode) => {
		setViewModeState(mode);
		setSearchParams(prev => {
			const next = new URLSearchParams(prev);
			next.set("view", mode);
			return next;
		}, { replace: true });
	};

	useEffect(() => {
		const view = searchParams.get("view");
		if (isCalendarViewMode(view)) setViewModeState(view);
	}, [searchParams]);
	
	const [currentDate, setCurrentDate] = useState(() => {
		const urlStart = searchParams.get("start_date");
		const urlEnd = searchParams.get("end_date");
		if (urlStart && urlEnd) {
			const start = moment(urlStart, "YYYY-MM-DD", true);
			if (start.isValid()) return start;
		}
		return moment();
	});
	

	// Status configuration
	const statusConfig = {
		All: { bgColor: "#000000", icon: "solar:checklist-bold" },
		Planned: { bgColor: "#3B82F6", icon: "codicon:circle-filled" },
		Completed: { bgColor: "#22C55E", icon: "codicon:circle-filled" },
		Cancelled: { bgColor: "#EF4444", icon: "codicon:circle-filled" },
	};

	// View mode options
	const viewModes: { value: CalendarViewMode; label: string; icon: string }[] = [
		{ value: "weekly", label: "Week", icon: "solar:calendar-bold" },
		{ value: "monthly", label: "Month", icon: "solar:calendar-minimalistic-bold" },
		{ value: "agenda", label: "Agenda", icon: "solar:list-bold" },
	];

	// Generate time slots (00:00 to 23:00)
	const timeSlots = Array.from({ length: 24 }, (_, i) => i);

	// Get date range based on view mode
	const getDateRange = () => {
		switch (viewMode) {
			case "weekly":
				return {
					start: moment(currentDate).startOf("week"),
					end: moment(currentDate).endOf("week"),
				};
			case "monthly":
				return {
					start: moment(currentDate).startOf("month").startOf("week"),
					end: moment(currentDate).endOf("month").endOf("week"),
				};
			case "agenda":
				return {
					start: moment(currentDate).startOf("day"),
					end: moment(currentDate).add(30, "days").endOf("day"),
				};
			default:
				return {
					start: moment(currentDate).startOf("week"),
					end: moment(currentDate).endOf("week"),
				};
		}
	};

	// Get days for current view
	const getDays = () => {
		const { start, end } = getDateRange();
		const days: moment.Moment[] = [];
		const current = moment(start);

		while (current.isSameOrBefore(end, "day")) {
			days.push(moment(current));
			current.add(1, "day");
		}

		return days;
	};

	// Fetch appointments data using new calendar endpoint
	const fetchAppointments = async (currentFilters: any, statusOverride?: AppointmentStatusType) => {
		if (isFetching.current) return;
		isFetching.current = true;

		try {
			setLoading(true);
			const { start, end } = getDateRange();
			
			// Use statusOverride if provided, otherwise use selectedStatus state
			const statusToUse = statusOverride !== undefined ? statusOverride : selectedStatus;
			const statusFilter = statusToUse !== "All" ? [statusToUse.toLowerCase()] : undefined;
			
			const res = await graphqlApi.gqlAppointmentCalendar({
				start_date: start.format("YYYY-MM-DD"),
				end_date: end.format("YYYY-MM-DD"),
				...(statusFilter && { status_filter: statusFilter as ("planned" | "completed" | "cancelled")[] }),
				...(ownerId !== undefined && ownerId !== null && { owner_id: String(ownerId) }),
			});

			if (!res.errors && res.data?.appointmentCalendar) {
				setAppointments(res.data.appointmentCalendar.appointments ?? []);
				setVisits(res.data.appointmentCalendar.visits ?? []);
			} else {
				createSwalToast(res.errors?.[0]?.message || "Error fetching appointments", "error");
				setAppointments([]);
				setVisits([]);
			}
		} catch (error) {
			console.error("Error fetching appointments:", error);
			createSwalToast("Error fetching appointments", "error");
			setAppointments([]);
			setVisits([]);
		} finally {
			setLoading(false);
			isFetching.current = false;
		}
	};

	// Get appointments for a specific day and hour
	const getAppointmentsForSlot = (day: moment.Moment, hour: number) => {
		return appointments.filter(appointment => {
			if (!appointment.appointment_date) return false;
			const appointmentDate = moment.parseZone(appointment.appointment_date);
			const appointmentHour = appointmentDate.hour();
			return appointmentDate.format("YYYY-MM-DD") === day.format("YYYY-MM-DD") && appointmentHour === hour;
		});
	};

	// Get appointment for a specific day
	const getAppointmentsForDay = (day: moment.Moment) => {
		return appointments.filter(appointment => {
			if (!appointment.appointment_date) return false;
			const appointmentDate = moment.parseZone(appointment.appointment_date);
			return appointmentDate.format("YYYY-MM-DD") === day.format("YYYY-MM-DD");
		});
	};

	// Get visits for a specific day and hour
	const getVisitsForSlot = (day: moment.Moment, hour: number) => {
		return visits.filter(visit => {
			if (!visit.visit_date) return false;
			const visitDate = moment.parseZone(visit.visit_date);
			const visitHour = visitDate.hour();
			return visitDate.format("YYYY-MM-DD") === day.format("YYYY-MM-DD") && visitHour === hour;
		});
	};

	// Get visits for a specific day
	const getVisitsForDay = (day: moment.Moment) => {
		return visits.filter(visit => {
			if (!visit.visit_date) return false;
			const visitDate = moment.parseZone(visit.visit_date);
			return visitDate.format("YYYY-MM-DD") === day.format("YYYY-MM-DD");
		});
	};

	// Get status color
	const getStatusColor = (status: string) => {
		switch (status?.toLowerCase()) {
			case "planned":
				return "bg-blue-500";
			case "completed":
				return "bg-green-500";
			case "cancelled":
				return "bg-red-500";
			default:
				return "bg-neutral-500";
		}
	};

	// Handle status filter
	const handleStatusClick = (status: AppointmentStatusType) => {
		setSelectedStatus(status);
		
		const updatedFilters = { ...filters };
		
		if (status === "All") {
			delete updatedFilters.appointment_status;
		} else {
			updatedFilters.appointment_status = {
				field: "appointment_status",
				condition: "is",
				value: {
					options: [status.toLowerCase()],
					fullOptions: [{ value: status.toLowerCase(), label: status }],
				},
				type: "select2_multiple",
			};
		}

		setFilters(updatedFilters);
		// Pass status directly to avoid stale state issue
		fetchAppointments(updatedFilters, status);
	};

	// Handle time slot click
	const handleTimeSlotClick = (day: moment.Moment, hour: number) => {
		const dateStr = day.format("YYYY-MM-DD");
		const timeStr = `${String(hour).padStart(2, "0")}:00:00`;
		if (onCreateAppointment) {
			onCreateAppointment({ appointment_date: `${dateStr} ${timeStr}` });
		}
	};

	// Handle day click (for monthly view)
	const handleDayClick = (day: moment.Moment) => {
		const dateStr = day.format("YYYY-MM-DD");
		if (onCreateAppointment) {
			onCreateAppointment({ appointment_date: `${dateStr} 09:00:00` });
		}
	};

	// Navigate
	const navigatePeriod = (direction: "prev" | "next") => {
		const amount = direction === "next" ? 1 : -1;
		switch (viewMode) {
			case "weekly":
				setCurrentDate(moment(currentDate).add(amount, "week"));
				break;
			case "monthly":
				setCurrentDate(moment(currentDate).add(amount, "month"));
				break;
			case "agenda":
				setCurrentDate(moment(currentDate).add(amount * 7, "days"));
				break;
		}
	};

	// Go to today
	const goToToday = () => {
		setCurrentDate(moment());
	};

	// Format header date
	const formatHeaderDate = () => {
		switch (viewMode) {
			case "weekly":
				const weekStart = moment(currentDate).startOf("week");
				const weekEnd = moment(currentDate).endOf("week");
				return `${weekStart.format("MMM D")} - ${weekEnd.format("MMM D, YYYY")}`;
			case "monthly":
				return currentDate.format("MMMM YYYY");
			case "agenda":
				return `${currentDate.format("MMM D")} - ${moment(currentDate).add(30, "days").format("MMM D, YYYY")}`;
			default:
				return currentDate.format("MMMM YYYY");
		}
	};

	// Handle drag and drop using new reschedule endpoint
	const handleDrop = async (e: React.DragEvent, day: moment.Moment, hour?: number) => {
		e.preventDefault();
		e.currentTarget.classList.remove("bg-blue-50");

		try {
			const data = JSON.parse(e.dataTransfer.getData("application/json"));
			if (data.type === "appointment") {
				// Find the original appointment to store its date
				const originalAppointment = appointments.find(v => v.id === data.id);
				if (!originalAppointment) return;
				const isHost = userData?.id != null && String(originalAppointment.owner?.id) === String(userData.id);
				if (!isHost) {
					createSwalToast("Only the host can reschedule this appointment", "error");
					return;
				}

				const originalDateStr = originalAppointment.appointment_date;
				const originalEndDateStr = originalAppointment.appointment_end_date;

				const newDate = moment(day);
				if (hour !== undefined) {
					newDate.hour(hour).minute(0).second(0);
				} else {
					// For monthly view, preserve the original time
					if (originalAppointment?.appointment_date) {
						const originalTime = moment.parseZone(originalAppointment.appointment_date);
						newDate.hour(originalTime.hour()).minute(originalTime.minute()).second(0);
					}
				}

				const newDateStr = newDate.format("YYYY-MM-DDTHH:mm:ss");

				// Optimistically update the local state
				setAppointments(prevAppointment =>
					prevAppointment.map(appointment => {
						if (appointment.id === data.id) {
							const duration = appointment.duration_minutes || 60;
							const endDate = moment(newDate).add(duration, "minutes");
							return {
								...appointment,
								appointment_date: newDateStr,
								appointment_end_date: endDate.format("YYYY-MM-DDTHH:mm:ss"),
							};
						}
						return appointment;
					})
				);

				// Update on server (no await to avoid blocking UI)
				graphqlApi.gqlRescheduleAppointment(data.id, {
					appointment_date: newDateStr,
				}).then((res) => {
					if (res.errors) {
						createSwalToast(res.errors[0]?.message || "Failed to reschedule", "error");
						return;
					}
					createSwalToast("Appointment rescheduled successfully", "success", {
						html: `
							<div style="display: flex; gap: 8px; justify-content: flex-end;">
								<button id="undo-reschedule-btn" type="button" class="bg-primary-600 hover:bg-primary-800 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 text-sm">Undo</button>
							</div>
						`,
						didOpen: () => {
							document.getElementById("undo-reschedule-btn")?.addEventListener("click", () => {
								// Revert to original date
								setAppointments(prevAppointment =>
									prevAppointment.map(appointment => {
										if (appointment.id === data.id) {
											return {
												...appointment,
												appointment_date: originalDateStr,
												appointment_end_date: originalEndDateStr,
											};
										}
										return appointment;
									})
								);

								// Revert on server
								graphqlApi.gqlRescheduleAppointment(data.id, {
									appointment_date: originalDateStr,
								}).then((revRes) => {
									if (!revRes.errors) createSwalToast("Appointment reverted to original time", "success");
								}).catch(error => {
									console.error("Error reverting appointment:", error);
									createSwalToast("Failed to revert appointment", "error");
									// Re-fetch on error
									fetchAppointments(filters);
								});

								Swal.close();
							});
						},
					});
				}).catch(error => {
					console.error("Error rescheduling appointment:", error);
					createSwalToast("Failed to reschedule appointment", "error");
					// Revert on error by re-fetching
					fetchAppointments(filters);
				});
			}
		} catch (error) {
			console.error("Error handling drop:", error);
			createSwalToast("Failed to reschedule appointment", "error");
		}
	};

	useEffect(() => {
		fetchAppointments(filters);
	}, [currentDate, viewMode, refreshKey]);

	const days = getDays();
	const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

	// Render Weekly View
	const getItemLayoutForDay = (day: moment.Moment) => {
		type ItemLayout = {
			type: CalendarItemType;
			id: string | number;
			data: any;
			startMinute: number;
			endMinute: number;
			column: number;
			totalColumns: number;
			spanColumns: number;
		};

		const dayKey = day.format("YYYY-MM-DD");
		const rawItems = [
			...appointments
				.filter(appointment => appointment.appointment_date && moment.parseZone(appointment.appointment_date).format("YYYY-MM-DD") === dayKey)
				.map(appointment => ({
					type: "appointment" as const,
					id: appointment.id,
					data: appointment,
					start: moment.parseZone(appointment.appointment_date),
					end: appointment.appointment_end_date ? moment.parseZone(appointment.appointment_end_date) : null,
					durationMinutes: Number(appointment.duration_minutes) || 60,
				})),
			...visits
				.filter(visit => visit.visit_date && moment.parseZone(visit.visit_date).format("YYYY-MM-DD") === dayKey)
				.map(visit => ({
					type: "visit" as const,
					id: visit.id,
					data: visit,
					start: moment.parseZone(visit.visit_date),
					end: visit.visit_end_date ? moment.parseZone(visit.visit_end_date) : null,
					durationMinutes: Number(visit.duration_minutes) || 60,
				})),
		]
			.map(item => {
				const startMinute = item.start.hour() * 60 + item.start.minute();
				const inferredEnd = item.end && item.end.isValid() ? item.end : moment(item.start).add(item.durationMinutes, "minutes");
				const rawEndMinute = inferredEnd.hour() * 60 + inferredEnd.minute();
				const endMinute = Math.max(rawEndMinute, startMinute + Math.max(item.durationMinutes, MIN_DURATION_MINUTES));
				return {
					...item,
					startMinute: Math.min(Math.max(startMinute, 0), 24 * 60),
					endMinute: Math.min(Math.max(endMinute, 0), 24 * 60),
				};
			})
			.filter(item => item.endMinute > item.startMinute)
			.sort((a, b) => {
				if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
				return b.endMinute - a.endMinute;
			});

		type WorkingItem = (typeof rawItems)[number] & {
			column: number;
			clusterId: number;
			layoutKey: string;
		};
		const workingItems: WorkingItem[] = [];
		let currentClusterId = 0;
		let currentClusterEnd = -1;
		const active: WorkingItem[] = [];

		rawItems.forEach(item => {
			for (let i = active.length - 1; i >= 0; i -= 1) {
				if (active[i].endMinute <= item.startMinute) active.splice(i, 1);
			}

			if (item.startMinute >= currentClusterEnd) {
				currentClusterId += 1;
				currentClusterEnd = item.endMinute;
			} else {
				currentClusterEnd = Math.max(currentClusterEnd, item.endMinute);
			}

			const usedColumns = new Set(active.map(activeItem => activeItem.column));
			let column = 0;
			while (usedColumns.has(column)) column += 1;

			const workingItem = {
				...item,
				column,
				clusterId: currentClusterId,
				layoutKey: `${item.type}-${item.id}-${item.startMinute}-${item.endMinute}`,
			};

			active.push(workingItem);
			workingItems.push(workingItem);
		});

		const clusterColumns = new Map<number, number>();
		workingItems.forEach(item => {
			const current = clusterColumns.get(item.clusterId) ?? 0;
			clusterColumns.set(item.clusterId, Math.max(current, item.column + 1));
		});

		const intervalOverlaps = (a: WorkingItem, b: WorkingItem) =>
			a.startMinute < b.endMinute && a.endMinute > b.startMinute;

		const spanByLayoutKey = new Map<string, number>();
		const itemsByCluster = new Map<number, WorkingItem[]>();
		workingItems.forEach(item => {
			const current = itemsByCluster.get(item.clusterId) ?? [];
			current.push(item);
			itemsByCluster.set(item.clusterId, current);
		});

		itemsByCluster.forEach((clusterItems, clusterId) => {
			const totalColumns = clusterColumns.get(clusterId) ?? 1;

			clusterItems.forEach(item => {
				let spanColumns = 1;
				for (let nextColumn = item.column + 1; nextColumn < totalColumns; nextColumn += 1) {
					const hasConflict = clusterItems.some(
						other =>
							other.column === nextColumn &&
							other.layoutKey !== item.layoutKey &&
							intervalOverlaps(item, other)
					);
					if (hasConflict) break;
					spanColumns += 1;
				}
				spanByLayoutKey.set(item.layoutKey, spanColumns);
			});
		});

		return workingItems.map<ItemLayout>(item => ({
			type: item.type,
			id: item.id,
			data: item.data,
			startMinute: item.startMinute,
			endMinute: item.endMinute,
			column: item.column,
			totalColumns: clusterColumns.get(item.clusterId) ?? 1,
			spanColumns: spanByLayoutKey.get(item.layoutKey) ?? 1,
		}));
	};

	/** Layout for a provisional (drop-preview) item so the shadow matches how the appointment will look when dropped */
	const getProvisionalItemLayout = (
		day: moment.Moment,
		startMinute: number,
		endMinute: number,
		excludeAppointmentId?: number
	): { topPx: number; heightPx: number; leftPercent: number; widthPercent: number } => {
		const dayKey = day.format("YYYY-MM-DD");
		const clampedStart = Math.min(Math.max(startMinute, 0), 24 * 60);
		const clampedEnd = Math.min(Math.max(endMinute, startMinute + MIN_DURATION_MINUTES), 24 * 60);
		if (clampedEnd <= clampedStart) {
			return { topPx: 0, heightPx: (MIN_DURATION_MINUTES / 60) * HOUR_HEIGHT_PX, leftPercent: 0, widthPercent: 100 };
		}
		type WorkingItem = {
			type: CalendarItemType;
			id: string | number;
			startMinute: number;
			endMinute: number;
			column: number;
			clusterId: number;
			layoutKey: string;
		};
		const rawItems = [
			...appointments
				.filter(
					a =>
						a.appointment_date &&
						moment.parseZone(a.appointment_date).format("YYYY-MM-DD") === dayKey &&
						(excludeAppointmentId == null || a.id !== excludeAppointmentId)
				)
				.map(a => ({
					type: "appointment" as const,
					id: a.id,
					start: moment.parseZone(a.appointment_date),
					end: a.appointment_end_date ? moment.parseZone(a.appointment_end_date) : null,
					durationMinutes: Number(a.duration_minutes) || 60,
				})),
			...visits
				.filter(v => v.visit_date && moment.parseZone(v.visit_date).format("YYYY-MM-DD") === dayKey)
				.map(v => ({
					type: "visit" as const,
					id: v.id,
					start: moment.parseZone(v.visit_date),
					end: v.visit_end_date ? moment.parseZone(v.visit_end_date) : null,
					durationMinutes: Number(v.duration_minutes) || 60,
				})),
		]
			.map(item => {
				const sm = item.start.hour() * 60 + item.start.minute();
				const inferredEnd = item.end?.isValid() ? item.end : moment(item.start).add(item.durationMinutes, "minutes");
				const em = inferredEnd.hour() * 60 + inferredEnd.minute();
				const endMin = Math.max(em, sm + Math.max(item.durationMinutes, MIN_DURATION_MINUTES));
				return {
					...item,
					startMinute: Math.min(Math.max(sm, 0), 24 * 60),
					endMinute: Math.min(Math.max(endMin, 0), 24 * 60),
				};
			})
			.filter(item => item.endMinute > item.startMinute);

		const withProvisional = [
			...rawItems,
			{ type: "appointment" as const, id: "__provisional__", startMinute: clampedStart, endMinute: clampedEnd },
		].sort((a, b) => {
			const aStart = "startMinute" in a ? a.startMinute : (a as { startMinute: number }).startMinute;
			const bStart = "startMinute" in b ? b.startMinute : (b as { startMinute: number }).startMinute;
			if (aStart !== bStart) return aStart - bStart;
			const aEnd = "endMinute" in a ? a.endMinute : (a as { endMinute: number }).endMinute;
			const bEnd = "endMinute" in b ? b.endMinute : (b as { endMinute: number }).endMinute;
			return bEnd - aEnd;
		});

		const normalized = withProvisional.map(item => {
			const startMinute = "startMinute" in item ? item.startMinute : (item as { startMinute: number }).startMinute;
			const endMinute = "endMinute" in item ? item.endMinute : (item as { endMinute: number }).endMinute;
			return { ...item, startMinute, endMinute };
		});

		const workingItems: WorkingItem[] = [];
		let currentClusterId = 0;
		let currentClusterEnd = -1;
		const active: WorkingItem[] = [];

		normalized.forEach(item => {
			for (let i = active.length - 1; i >= 0; i -= 1) {
				if (active[i].endMinute <= item.startMinute) active.splice(i, 1);
			}
			if (item.startMinute >= currentClusterEnd) {
				currentClusterId += 1;
				currentClusterEnd = item.endMinute;
			} else {
				currentClusterEnd = Math.max(currentClusterEnd, item.endMinute);
			}
			const usedColumns = new Set(active.map(a => a.column));
			let column = 0;
			while (usedColumns.has(column)) column += 1;
			const layoutKey = item.id === "__provisional__" ? "__provisional__" : `${item.type}-${item.id}-${item.startMinute}-${item.endMinute}`;
			workingItems.push({
				type: item.type as CalendarItemType,
				id: item.id,
				startMinute: item.startMinute,
				endMinute: item.endMinute,
				column,
				clusterId: currentClusterId,
				layoutKey,
			});
			active.push(workingItems[workingItems.length - 1]);
		});

		const clusterColumns = new Map<number, number>();
		workingItems.forEach(item => {
			const current = clusterColumns.get(item.clusterId) ?? 0;
			clusterColumns.set(item.clusterId, Math.max(current, item.column + 1));
		});
		const intervalOverlaps = (a: WorkingItem, b: WorkingItem) =>
			a.startMinute < b.endMinute && a.endMinute > b.startMinute;
		const itemsByCluster = new Map<number, WorkingItem[]>();
		workingItems.forEach(item => {
			const list = itemsByCluster.get(item.clusterId) ?? [];
			list.push(item);
			itemsByCluster.set(item.clusterId, list);
		});
		const spanByLayoutKey = new Map<string, number>();
		itemsByCluster.forEach((clusterItems, clusterId) => {
			const totalColumns = clusterColumns.get(clusterId) ?? 1;
			clusterItems.forEach(item => {
				let spanColumns = 1;
				for (let nextColumn = item.column + 1; nextColumn < totalColumns; nextColumn += 1) {
					const hasConflict = clusterItems.some(
						other => other.column === nextColumn && other.layoutKey !== item.layoutKey && intervalOverlaps(item, other)
					);
					if (hasConflict) break;
					spanColumns += 1;
				}
				spanByLayoutKey.set(item.layoutKey, spanColumns);
			});
		});

		const provisional = workingItems.find(item => item.id === "__provisional__");
		if (!provisional) return { topPx: 0, heightPx: 0, leftPercent: 0, widthPercent: 100 };
		const totalColumns = clusterColumns.get(provisional.clusterId) ?? 1;
		const spanColumns = spanByLayoutKey.get("__provisional__") ?? 1;
		const baseWidth = 100 / totalColumns;
		return {
			topPx: (provisional.startMinute / 60) * HOUR_HEIGHT_PX,
			heightPx: ((provisional.endMinute - provisional.startMinute) / 60) * HOUR_HEIGHT_PX,
			leftPercent: provisional.column * baseWidth,
			widthPercent: baseWidth * spanColumns,
		};
	};

	const getHourFromPointer = (e: React.MouseEvent<HTMLElement> | React.DragEvent<HTMLElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const y = e.clientY - rect.top;
		const hour = Math.floor(y / HOUR_HEIGHT_PX);
		return Math.min(Math.max(hour, 0), 23);
	};

	const renderWeeklyView = () => (
		<div className="overflow-auto max-h-[70vh]">
			<div className="grid grid-cols-[80px_repeat(7,1fr)] min-w-max">
				{/* Header */}
				<div className="sticky top-0 bg-white z-20 border-b border-neutral-200"></div>
				{days.slice(0, 7).map((day, index) => {
					const isToday = day.isSame(moment(), "day");
					return (
						<div
							key={index}
							className={`sticky top-0 z-20 px-4 py-3 border-b border-r border-neutral-200 text-center z-[9999] ${
								isToday ? "bg-primary-50" : "bg-white"
							}`}
						>
							<div className="text-xs font-medium text-neutral-500">{day.format("ddd")}</div>
							<div className={`text-lg font-semibold mt-1 ${isToday ? "text-primary-600" : "text-neutral-900"}`}>
								{day.format("D")}
							</div>
						</div>
					);
				})}

				{/* Time labels */}
				<div className="border-r border-neutral-200 bg-neutral-50">
					{timeSlots.map(hour => (
						<div
							key={hour}
							className="h-[60px] px-3 py-2 border-b border-neutral-200 text-xs text-neutral-500 text-center"
						>
							{String(hour).padStart(2, "0")}:00
						</div>
					))}
				</div>

				{/* Day columns */}
				{days.slice(0, 7).map((day, dayIndex) => {
					const isToday = day.isSame(moment(), "day");
					const dayLayoutItems = getItemLayoutForDay(day);
					const currentMinute = moment().hour() * 60 + moment().minute();

					return (
						<div
							key={dayIndex}
							className={`relative border-r border-neutral-200 cursor-pointer ${
								isToday ? "bg-primary-50/20" : "bg-white"
							}`}
							style={{ height: `${DAY_HEIGHT_PX}px` }}
						onClick={e => {
							if (document.body.classList.contains("appointment-details-modal-open")) return;
							if (document.body.classList.contains("visit-details-modal-open")) return;
							if ((e.target as HTMLElement).closest(".appointment-card") || (e.target as HTMLElement).closest(".visit-card")) return;
							handleTimeSlotClick(day, getHourFromPointer(e));
						}}
							onDragOver={e => {
								e.preventDefault();
								e.currentTarget.classList.add("bg-blue-50");
								if (draggingAppointment) {
									setDropPreview({ dayKey: day.format("YYYY-MM-DD"), hour: getHourFromPointer(e) });
								}
							}}
							onDragLeave={e => {
								e.currentTarget.classList.remove("bg-blue-50");
								// Only clear when actually leaving the day column (not entering a child)
								const related = e.relatedTarget as Node | null;
								if (!related || !e.currentTarget.contains(related)) {
									setDropPreview(null);
								}
							}}
							onDrop={e => {
								handleDrop(e, day, getHourFromPointer(e));
							}}
						>
							{timeSlots.map(hour => (
								<div key={`${dayIndex}-${hour}`} className="h-[60px] border-b border-neutral-200" />
							))}

							{isToday && (
								<div
									className="absolute left-0 right-0 h-0.5 bg-red-500 z-20"
									style={{ top: `${(currentMinute / 60) * HOUR_HEIGHT_PX}px` }}
								/>
							)}

							{/* Drop preview shadow: exact position/size the appointment will have when dropped */}
							{draggingAppointment &&
								dropPreview &&
								dropPreview.dayKey === day.format("YYYY-MM-DD") &&
								(() => {
									const layout = getProvisionalItemLayout(
										day,
										dropPreview.hour * 60,
										dropPreview.hour * 60 + draggingAppointment.duration_minutes,
										draggingAppointment.id
									);
									return (
										<div
											className="absolute z-[9999] pointer-events-none rounded border-2 border-blue-300 bg-blue-50/60 px-0.5"
											style={{
												top: `${layout.topPx}px`,
												height: `${layout.heightPx}px`,
												left: `calc(${layout.leftPercent}% + 0px)`,
												width: `calc(${layout.widthPercent}% - 0px)`,
											}}
											aria-hidden
										/>
									);
								})()}

							{dayLayoutItems.map(item => {
								const topPx = (item.startMinute / 60) * HOUR_HEIGHT_PX;
								const heightPx = ((item.endMinute - item.startMinute) / 60) * HOUR_HEIGHT_PX;
								const baseColumnWidthPercent = 100 / item.totalColumns;
								const widthPercent = baseColumnWidthPercent * item.spanColumns;
								const leftPercent = item.column * baseColumnWidthPercent;
								const isAppointmentOwnedByUser = item.type === "appointment" && String(item.data.owner?.id) === String(userData?.id);

								const handleWrapperDragStart = (e: React.DragEvent) => {
									if (!isAppointmentOwnedByUser) return;
									e.dataTransfer.effectAllowed = "move";
									e.dataTransfer.setData("application/json", JSON.stringify({ type: "appointment", id: item.data.id }));
									setDraggingAppointment({
										id: item.data.id,
										duration_minutes: Number(item.data.duration_minutes) || 60,
									});
								};

								return (
									<div
										key={`${item.type}-${item.id}`}
										className={`absolute z-30 px-0.5 ${isAppointmentOwnedByUser ? "cursor-grab active:cursor-grabbing" : ""}`}
										style={{
											top: `${topPx}px`,
											height: `${heightPx}px`,
											left: `calc(${leftPercent}% + 0px)`,
											width: `calc(${widthPercent}% - 0px)`,
										}}
										draggable={isAppointmentOwnedByUser}
										onDragStart={handleWrapperDragStart}
									>
										{item.type === "appointment" ? (
											<AppointmentCard
												appointment={item.data}
												onClick={() => navigate(`/appointment/preview/${item.id}`)}
												onMarkComplete={onMarkComplete}
												onDeleteModal={onDeleteModal}
												onEditModal={onEditModal}
												ownerId={userData?.id}
												draggable={false}
												compact
											/>
										) : (
											<VisitCard
												visit={item.data}
												onClick={() => navigate(`/visit/preview/${item.id}`)}
												ownerId={userData?.id}
												compact
											/>
										)}
									</div>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);

	// Render Daily View
	const renderDailyView = () => (
		<div className="overflow-auto">
			<div className="grid grid-cols-[80px_1fr]">
				{/* Header */}
				<div className="sticky top-0 bg-white z-10 border-b border-neutral-200"></div>
				<div
					className={`sticky top-0 z-10 px-4 py-3 border-b border-r border-neutral-200 text-center ${
						currentDate.isSame(moment(), "day") ? "bg-primary-50" : "bg-white"
					}`}
				>
					<div className="text-xs font-medium text-neutral-500">{currentDate.format("dddd")}</div>
					<div
						className={`text-lg font-semibold mt-1 ${
							currentDate.isSame(moment(), "day") ? "text-primary-600" : "text-neutral-900"
						}`}
					>
						{currentDate.format("MMMM D, YYYY")}
					</div>
				</div>

				{/* Time slots */}
				{timeSlots.map(hour => {
					const slotAppointments = getAppointmentsForSlot(currentDate, hour);
					const slotVisits = getVisitsForSlot(currentDate, hour);
					const slotItems = [
						...slotAppointments.map(appointment => ({
							type: "appointment" as const,
							id: appointment.id,
							date: appointment.appointment_date,
							data: appointment,
						})),
						...slotVisits.map(visit => ({
							type: "visit" as const,
							id: visit.id,
							date: visit.visit_date,
							data: visit,
						})),
					].sort((a, b) => {
						const aTime = a.date ? moment.parseZone(a.date).valueOf() : 0;
						const bTime = b.date ? moment.parseZone(b.date).valueOf() : 0;
						return aTime - bTime;
					});
					const isCurrentHour = currentDate.isSame(moment(), "day") && moment().hour() === hour;

					return (
						<React.Fragment key={hour}>
							<div className="px-3 py-2 border-b border-r border-neutral-200 text-xs text-neutral-500 bg-neutral-50 text-center">
								{String(hour).padStart(2, "0")}:00
							</div>
							<div
								className="min-h-[60px] p-2 border-b border-r border-neutral-200 relative cursor-pointer hover:bg-neutral-50 transition-colors"
							onClick={e => {
								if (document.body.classList.contains("appointment-details-modal-open")) return;
								if (document.body.classList.contains("visit-details-modal-open")) return;
								if ((e.target as HTMLElement).closest(".appointment-card") || (e.target as HTMLElement).closest(".visit-card")) return;
								handleTimeSlotClick(currentDate, hour);
							}}
								onDragOver={e => {
									e.preventDefault();
									e.currentTarget.classList.add("bg-blue-50");
								}}
								onDragLeave={e => {
									e.currentTarget.classList.remove("bg-blue-50");
								}}
								onDrop={e => handleDrop(e, currentDate, hour)}
							>
								{isCurrentHour && <div className="absolute left-0 right-0 top-0 h-0.5 bg-red-500 z-10" />}
								<div
									className="grid gap-1 min-h-0"
									style={{
										gridTemplateColumns: `repeat(${Math.max(slotItems.length, 1)}, minmax(0, 1fr))`,
									}}
								>
									{slotItems.map(item => (
										<div key={`${item.type}-${item.id}`} className="min-w-0">
											{item.type === "appointment" ? (
												<AppointmentCard
													appointment={item.data}
													onClick={() => navigate(`/appointment/preview/${item.id}`)}
													onMarkComplete={onMarkComplete}
													onDeleteModal={onDeleteModal}
													onEditModal={onEditModal}
													ownerId={userData?.id}
													draggable={String(item.data.owner?.id) === String(userData?.id)}
													compact
												/>
											) : (
												<VisitCard
													visit={item.data}
													onClick={() => navigate(`/visit/preview/${item.id}`)}
													ownerId={userData?.id}
													compact
												/>
											)}
										</div>
									))}
								</div>
							</div>
						</React.Fragment>
					);
				})}
			</div>
		</div>
	);

	// Render Monthly View
	const renderMonthlyView = () => (
		<div className="p-4">
			<div className="grid grid-cols-7 gap-px bg-neutral-200 border border-neutral-200 rounded-lg overflow-hidden">
				{/* Week day headers */}
				{weekDays.map(day => (
					<div key={day} className="bg-neutral-50 px-3 py-2 text-center text-xs font-medium text-neutral-700">
						{day}
					</div>
				))}

				{/* Calendar days */}
				{days.map((day, index) => {
					const dayAppointments = getAppointmentsForDay(day);
					const dayVisits = getVisitsForDay(day);
					const isCurrentMonth = day.month() === currentDate.month();
					const isToday = day.isSame(moment(), "day");
					const dayItems = [...dayAppointments.map(a => ({ type: "appointment" as const, id: a.id, data: a })), ...dayVisits.map(v => ({ type: "visit" as const, id: v.id, data: v }))];

					return (
						<div
							key={index}
							className={`bg-white min-h-[120px] p-2 cursor-pointer hover:bg-neutral-50 transition-colors ${
								!isCurrentMonth ? "opacity-50" : ""
							}`}
						onClick={e => {
							if (document.body.classList.contains("appointment-details-modal-open")) return;
							if (document.body.classList.contains("visit-details-modal-open")) return;
							if ((e.target as HTMLElement).closest(".appointment-card") || (e.target as HTMLElement).closest(".visit-card")) return;
							handleDayClick(day);
						}}
							onDragOver={e => {
								e.preventDefault();
								e.currentTarget.classList.add("bg-blue-50");
							}}
							onDragLeave={e => {
								e.currentTarget.classList.remove("bg-blue-50");
							}}
							onDrop={e => handleDrop(e, day)}
						>
							<div className="flex items-center justify-between mb-2">
								<span
									className={`text-sm font-medium ${
										isToday
											? "bg-primary-600 text-white w-6 h-6 rounded-full flex items-center justify-center"
											: isCurrentMonth
											? "text-neutral-900"
											: "text-neutral-400"
									}`}
								>
									{day.format("D")}
								</span>
							</div>
							<div className="space-y-1">
								{dayItems.map(item =>
									item.type === "appointment" ? (
										<AppointmentCard
											key={`appt-${item.id}`}
											appointment={item.data}
											onClick={() => navigate(`/appointment/preview/${item.id}`)}
											onMarkComplete={onMarkComplete}
											onDeleteModal={onDeleteModal}
											onEditModal={onEditModal}
											ownerId={userData?.id}
											draggable={String(item.data.owner?.id) === String(userData?.id)}
											compact
											isMonth={viewMode === "monthly"}
										/>
									) : (
										<VisitCard
											key={`visit-${item.id}`}
											visit={item.data}
											onClick={() => navigate(`/visit/preview/${item.id}`)}
											ownerId={userData?.id}
											compact
										/>
									))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);

	// Render Agenda View
	const renderAgendaView = () => {
		type AgendaItem = { type: "appointment"; id: string; dateStr: string; data: any } | { type: "visit"; id: string; dateStr: string; data: any };
		const groupedByDate: Record<string, AgendaItem[]> = {};
		appointments.forEach(appointment => {
			if (appointment.appointment_date) {
				const dateKey = moment.parseZone(appointment.appointment_date).format("YYYY-MM-DD");
				if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
				groupedByDate[dateKey].push({ type: "appointment", id: appointment.id, dateStr: appointment.appointment_date, data: appointment });
			}
		});
		visits.forEach(visit => {
			if (visit.visit_date) {
				const dateKey = moment.parseZone(visit.visit_date).format("YYYY-MM-DD");
				if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
				groupedByDate[dateKey].push({ type: "visit", id: visit.id, dateStr: visit.visit_date, data: visit });
			}
		});

		const sortedDates = Object.keys(groupedByDate).sort();

		return (
			<div className="p-4 space-y-4">
				{sortedDates.length === 0 ? (
					<div className="text-center py-8 text-neutral-500">
						<Icon icon="solar:calendar-search-outline" width={48} className="mx-auto mb-2" />
						<p>No appointments or visits scheduled for this period</p>
					</div>
				) : (
					sortedDates.map(dateKey => {
						const dayItems = groupedByDate[dateKey].sort(
							(a, b) => new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime()
						);
						const date = moment(dateKey);
						const isToday = date.isSame(moment(), "day");
						const apptCount = dayItems.filter(i => i.type === "appointment").length;
						const visitCount = dayItems.filter(i => i.type === "visit").length;
						const countLabel =
							apptCount && visitCount
								? `${apptCount} appointment${apptCount !== 1 ? "s" : ""}, ${visitCount} visit${visitCount !== 1 ? "s" : ""}`
								: apptCount
								? `${apptCount} appointment${apptCount !== 1 ? "s" : ""}`
								: `${visitCount} visit${visitCount !== 1 ? "s" : ""}`;

						return (
							<div key={dateKey} className="border border-neutral-200 rounded-lg overflow-hidden">
								<div
									className={`px-4 py-3 font-medium text-sm ${
										isToday ? "bg-primary-50 text-primary-700" : "bg-neutral-50 text-neutral-700"
									}`}
								>
									{date.format("dddd, MMMM D, YYYY")}
									{isToday && (
										<span className="ml-2 px-2 py-0.5 text-xs bg-primary-600 text-white rounded">Today</span>
									)}
									<span className="ml-2 text-neutral-500">({countLabel})</span>
								</div>
								<div className="divide-y divide-neutral-100">
									{dayItems.map(item => {
										if (item.type === "appointment") {
											const appointment = item.data;
											return (
												<div
													key={`appt-${item.id}`}
													className="p-4 hover:bg-neutral-50 cursor-pointer transition-colors"
													onClick={() => navigate(`/appointment/preview/${appointment.id}`)}
												>
													<div className="flex items-start gap-4">
														<div className="text-sm text-neutral-500 w-16">
															{moment.parseZone(appointment.appointment_date).format("HH:mm")}
														</div>
														<div className="flex-1">
															<div className="flex items-center gap-2 mb-1">
																<span className={`px-2 py-0.5 text-xs font-medium rounded text-white ${getStatusColor(appointment.appointment_status)}`}>
																	{appointment.appointment_status?.toUpperCase()}
																</span>
																<span className={`px-2 py-0.5 text-xs rounded ${appointment.appointment_type === "on_site" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
																	{appointment.appointment_type === "on_site" ? "On-Site" : "Virtual"}
																</span>
															</div>
															<h4 className="font-medium text-neutral-900">{appointment.subject}</h4>
															<p className="text-sm text-neutral-600">{appointment.appointmentable_name}</p>
														</div>
														{appointment.appointment_status === "planned" && moment.parseZone(appointment.appointment_date).isBefore(moment(), "day") && onMarkComplete && (
															<button
																onClick={e => { e.stopPropagation(); onMarkComplete(appointment); }}
																className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 transition-colors flex items-center gap-1"
															>
																<Icon icon="solar:check-circle-bold" width={14} />
																Complete
															</button>
														)}
													</div>
												</div>
											);
										}
										const visit = item.data;
										return (
											<div
												key={`visit-${item.id}`}
												className="p-4 hover:bg-neutral-50 cursor-pointer transition-colors"
												onClick={() => navigate(`/visit/preview/${visit.id}`)}
											>
												<div className="flex items-start gap-4">
													<div className="text-sm text-neutral-500 w-16">
														{moment.parseZone(visit.visit_date).format("HH:mm")}
													</div>
													<div className="flex-1">
														<div className="flex items-center gap-2 mb-1">
															<span className={`px-2 py-0.5 text-xs font-medium rounded text-white ${getStatusColor(visit.visit_status ?? "")}`}>
																{(visit.visit_status ?? "").toUpperCase()}
															</span>
															<span className={`px-2 py-0.5 text-xs rounded ${visit.visit_type === "on_site" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
																{visit.visit_type === "on_site" ? "On-Site" : "Virtual"}
															</span>
															<span className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-700">Visit</span>
														</div>
														<h4 className="font-medium text-neutral-900">{visit.visit_subject ?? "-"}</h4>
														<p className="text-sm text-neutral-600">{visit.visitable_name ?? "-"}</p>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						);
					})
				)}
			</div>
		);
	};

	return (
		<div className="datatables pagination-padding m-3 border border-neutral-200 rounded-lg bg-white">
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b border-neutral-200">
				{/* Status Filters */}
				<div className="flex items-center gap-2">
					{(Object.keys(statusConfig) as AppointmentStatusType[]).map((status, index) => (
						<React.Fragment key={status}>
							<button
								type="button"
								onClick={() => handleStatusClick(status)}
								className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
									selectedStatus === status ? `text-white` : "bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
								}`}
								style={{
									backgroundColor: selectedStatus === status ? statusConfig[status].bgColor : undefined,
								}}
							>
								<Icon
									icon={statusConfig[status].icon}
									width={16}
									height={16}
									className={selectedStatus === status ? "text-white" : "text-neutral-500"}
									style={{
										color: selectedStatus === status ? "white" : statusConfig[status].bgColor,
									}}
								/>
								<span className="text-sm font-medium">{status}</span>
							</button>
							{index === 0 && <span className="text-neutral-300">|</span>}
						</React.Fragment>
					))}
				</div>

				{/* View Mode & Navigation */}
				<div className="flex items-center gap-4">
					{/* View Mode Selector */}
					<div className="flex items-center bg-neutral-100 rounded-lg p-1">
						{viewModes.map(mode => (
							<button
								key={mode.value}
								onClick={() => setViewMode(mode.value)}
								className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
									viewMode === mode.value
										? "bg-white text-primary-600 shadow-sm"
										: "text-neutral-600 hover:text-neutral-900"
								}`}
							>
								<Icon icon={mode.icon} width={14} />
								{mode.label}
							</button>
						))}
					</div>

					{/* Navigation */}
					<div className="flex items-center gap-2">
						<button onClick={() => navigatePeriod("prev")} className="p-2 hover:bg-neutral-100 rounded">
							<Icon icon="solar:alt-arrow-left-outline" width={20} />
						</button>
						<span className="text-sm font-medium min-w-[200px] text-center">{formatHeaderDate()}</span>
						<button onClick={() => navigatePeriod("next")} className="p-2 hover:bg-neutral-100 rounded">
						<Icon icon="solar:alt-arrow-right-outline" width={20} />
					</button>
					<button
							onClick={goToToday}
							className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded hover:bg-primary-600"
					>
						Today
					</button>
					</div>
				</div>
			</div>

			{/* Calendar Content */}
			{loading ? (
				<div className="flex justify-center items-center p-8">
					<LoadingSpinner />
				</div>
			) : (
				<div className="max-h-[calc(100vh-300px)] overflow-auto">
					{viewMode === "weekly" && renderWeeklyView()}
					{viewMode === "monthly" && renderMonthlyView()}
					{viewMode === "agenda" && renderAgendaView()}
				</div>
			)}
		</div>
	);
};

export default AppointmentCalendarView;
