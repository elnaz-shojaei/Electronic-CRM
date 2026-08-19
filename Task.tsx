import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from 'react-router-dom';
import TaskAPI from "../../../../config/sub-apis/task.api";
import DashboardAPI from "../../../../config/sub-apis/dashboard.api";
import { formatTime } from "../../../../helper/fieldsHelper";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import { Tooltip } from "react-tooltip";
import { getBadgeColor } from "../../../../utils/color";
import { createSwalAlert, createSwalToast } from "../../../../helper/swalHelpers";
import LoadingDots from "../../../../components/LoadingDots";
import moment from "moment";
import DueDateModal from "../../../../components/DueDateModal";
import { getToken } from "../../../../config/config";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { displayImage } from "../../../../components/Functions/CommonFunctions";

type FilterStatus = "all" | "Ongoing" | "Completed" | "Delayed" | "Not Started" | "Awaiting Input";
type FilterPriority = "all" | "High" | "Normal" | "Low";
type FilterDate = "all" | "today" | "overdue" | "upcoming";

interface TaskQueueItem {
	id: string;
	organization_id: number;
	task_queue_id: string;
	task_id: string;
	owner_id: string;
	userable_type: string;
	userable_id: string;
	moduleable_type: string;
	moduleable_id: string;
	sort_order: number;
	started_at: string | null;
	ended_at: string | null;
	deleted_at: string | null;
	created_at: string;
	updated_at: string;
}

interface TaskQueue {
	id: string;
	organization_id: number;
	owner_id: string;
	name: string;
	status: number;
	started_at: string | null;
	closed_at: string | null;
	created_at: string;
	updated_at: string;
	task_queue_items: TaskQueueItem[];
}

// Color mapping for task statuses
const TASK_STATUS_COLORS: Record<string, string> = {
	"Ongoing": "#2196F3",           // Blue
	"Delayed": "#E44F5D",           // Red
	"Not Started": "#BA8C55",       // Brown
	"Awaiting Input": "#FF9A66",    // Orange
};

const DEFAULT_COLOR = "#545454";

const ExpandableSubject = ({ subject, taskId }: { subject: string; taskId: string }) => {
	const [expanded, setExpanded] = useState(false);
	const isLong = subject?.length > 80;

	return (
		<div className="text-xs">
			<Link
				to={`/task/preview/${taskId}`}
				className={`block text-xs font-medium text-neutral-900 hover:text-primary-600 ${expanded ? "text-wrap" : "truncate"}`}
			>
				{subject}
			</Link>
			{isLong && (
				<button
					onClick={(e) => {
						e.preventDefault();
						setExpanded(!expanded);
					}}
					className="text-primary-500 text-xs mt-0.5"
				>
					{expanded ? (
						<span className="flex items-center gap-1 text-green-600 text-xs hover:underline">
							show less <Icon icon="solar:alt-arrow-up-outline" className="text-primary-500" width={12} />
						</span>
					) : (
						<span className="flex items-center gap-1 text-green-600 text-xs hover:underline">
							show more <Icon icon="solar:alt-arrow-down-outline" className="text-primary-500" width={12} />
						</span>
					)}
				</button>
			)}
		</div>
	);
};

const formateName = (name?: string) => {
	if (!name) return "";

	// Handle namespaced types like "App\\Models\\Contact" or "App\\Models\\Lead"
	if (name.includes("\\")) {
		const parts = name.split("\\");
		name = parts[parts.length - 1]; // Get the last part (model name)
	}

	if (name === "SalesOrder") {
		return "sales";
	}
	if (name === "PurchaseOrder") {
		return "purchase";
	}
	return name.toLowerCase().replace(/_/g, " ");
};

interface SalesPersonTasksProps {
	isFullscreen?: boolean;
	onToggleFullscreen?: () => void;
	date_from?: string;
	date_to?: string;
	globalUserId?: number;
}

export default function SalesPersonTasks({ isFullscreen = false, onToggleFullscreen, date_from, date_to, globalUserId }: SalesPersonTasksProps) {
	const navigate = useNavigate();
	const userData = getToken("userData");
	const [tasks, setTasks] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const [selectedStatus, setSelectedStatus] = useState<FilterStatus>("all");
	const [selectedPriority, setSelectedPriority] = useState<FilterPriority>("all");
	const [selectedDate, setSelectedDate] = useState<FilterDate>("overdue");
	const [dueDateModalOpen, setDueDateModalOpen] = useState(false);
	const [selectedTask, setSelectedTask] = useState<any | null>(null);
	const [taskIdsInQueue, setTaskIdsInQueue] = useState<Set<string>>(new Set());
	const [taskQueueMapping, setTaskQueueMapping] = useState<Map<string, { queue_id: string; item_id: string }>>(new Map());
	const [queueItemsWithOrder, setQueueItemsWithOrder] = useState<TaskQueueItem[]>([]);
	const [queueOperationLoading, setQueueOperationLoading] = useState(false);
	const [activeQueue, setActiveQueue] = useState<TaskQueue | null>(null);
	const [isUpdateTaskModalOpen, setIsUpdateTaskModalOpen] = useState(false);
	const [currentTaskForUpdate, setCurrentTaskForUpdate] = useState<any | null>(null);
	const [currentQueueTask, setCurrentQueueTask] = useState<TaskQueueItem | null>(null);
	const [taskStatsData, setTaskStatsData] = useState<{
		total_count: number;
		ongoing_count: number;
		delayed_count: number;
		not_started_count: number;
		awaiting_input_count: number;
		pie_chart_data: Array<{ status: string; count: number }>;
	} | null>(null);
	const [isStatsLoading, setIsStatsLoading] = useState(false);
	const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const taskApiRef = useRef(new TaskAPI());
	const dashboardApiRef = useRef(new DashboardAPI());
	const isLoadingRef = useRef(false);

	const perPage = isFullscreen ? 20 : 10;

	useEffect(() => {
		setSelectedUserId(globalUserId);
	}, [globalUserId]);

	const buildFilters = useCallback(() => {
		const filters: Record<string, any> = {};
		const today = moment().format("YYYY-MM-DD");
		const yesterday = moment().subtract(1, 'day').format("YYYY-MM-DD");
		const tomorrow = moment().add(1, 'day').format("YYYY-MM-DD");

		const oneYearAgo = moment().subtract(1, 'year').format("YYYY-MM-DD");
		const oneYearFromNow = moment().add(1, 'year').format("YYYY-MM-DD");

		// Add owner_id filter if selectedUserId is set
		if (selectedUserId) {
			filters.owner_id = {
				field: "owner_id",
				condition: "is",
				value: {
					options: [String(selectedUserId)]
				},
				type: "select2_multiple_api_user"
			};
		}

		if (selectedStatus !== "all") {
			filters.status = {
				field: "status",
				condition: "is",
				value: {
					options: [selectedStatus],
					fullOptions: [{ value: selectedStatus, label: selectedStatus }],
					relation: null
				},
				type: "select2_multiple"
			};
		}
		else {
			filters.status = {
				field: "status",
				condition: "is_not",
				value: {
					options: ["Completed"],
					fullOptions: [{ value: "Completed", label: "Completed" }],
					relation: null
				},
				type: "select2_multiple"
			};
		}

		if (selectedPriority !== "all") {
			filters.priority = {
				field: "priority",
				condition: "is",
				value: {
					options: [selectedPriority],
					fullOptions: [{ value: selectedPriority, label: selectedPriority }],
					relation: null
				},
				type: "select2_multiple"
			};
		}

		if (selectedDate === "today") {
			filters.due_date = {
				field: "due_date",
				condition: "today",
				value: { value: today },
				type: "date"
			};
		}
		else if (selectedDate === "overdue") {
			filters.due_date = {
				field: "due_date",
				condition: "between",
				value: {
					from: oneYearAgo,
					to: yesterday
				},
				type: "date"
			};
		}
		else if (selectedDate === "upcoming") {
			filters.due_date = {
				field: "due_date",
				condition: "between",
				value: {
					from: tomorrow,
					to: oneYearFromNow
				},
				type: "date"
			};
		}

		return filters;
	}, [selectedStatus, selectedPriority, selectedDate, selectedUserId]);

	const taskMatchesFilters = useCallback((task: any) => {
		// Check owner_id filter
		if (selectedUserId && String(task.owner_id) !== String(selectedUserId)) {
			return false;
		}

		// Check status filter (case-insensitive)
		if (selectedStatus !== "all" && task.status?.toLowerCase() !== selectedStatus.toLowerCase()) {
			return false;
		}

		// Check priority filter (case-insensitive)
		if (selectedPriority !== "all" && task.priority?.toLowerCase() !== selectedPriority.toLowerCase()) {
			return false;
		}

		// Check date filter
		const today = moment().format("YYYY-MM-DD");
		const yesterday = moment().subtract(1, 'day').format("YYYY-MM-DD");
		const tomorrow = moment().add(1, 'day').format("YYYY-MM-DD");

		const oneYearAgo = moment().subtract(1, 'year').format("YYYY-MM-DD");
		const oneYearFromNow = moment().add(1, 'year').format("YYYY-MM-DD");

		if (selectedDate === "today") {
			const taskDueDate = task.due_date ? moment(task.due_date).format("YYYY-MM-DD") : null;
			if (taskDueDate !== today) {
				return false;
			}
		} else if (selectedDate === "overdue") {
			const taskDueDate = task.due_date ? moment(task.due_date) : null;
			if (!taskDueDate || !taskDueDate.isBetween(oneYearAgo, yesterday, 'day', '[]')) {
				return false;
			}
			// For overdue, exclude completed tasks unless status filter is explicitly set
			if (selectedStatus === "all" && task.status?.toLowerCase() === "completed") {
				return false;
			}
		} else if (selectedDate === "upcoming") {
			const taskDueDate = task.due_date ? moment(task.due_date) : null;
			if (!taskDueDate || !taskDueDate.isBetween(tomorrow, oneYearFromNow, 'day', '[]')) {
				return false;
			}
			// For upcoming, exclude completed tasks unless status filter is explicitly set
			if (selectedStatus === "all" && task.status?.toLowerCase() === "completed") {
				return false;
			}
		}

		return true;
	}, [selectedStatus, selectedPriority, selectedDate, selectedUserId]);

	const fetchTasks = useCallback(async (pageNum: number, append: boolean = false) => {
		if (isLoadingRef.current) return;

		isLoadingRef.current = true;
		setLoading(true);
		try {
			const filters = buildFilters();
			const filterParam = encodeURIComponent(JSON.stringify(filters));

			const response = await taskApiRef.current.fetchDataTask({
				page: pageNum,
				pageSize: perPage,
				sortField: "due_date",
				sortDirection: "asc",
				fields: ["subject", "id", "due_date", "status", "priority", "owner_id", "reminder", "next_reminder_at", "userable_type", "userable_id", "moduleable_type", "moduleable_id"],
				filterParam: filterParam,
				date_from: date_from,
				date_to: date_to,
			});

			if (response?.data?.data) {
				const apiResult = response.data.data;
				const newTasks = apiResult.data || [];
				const currentPage = apiResult.current_page || pageNum;
				const lastPage = apiResult.last_page || 1;

				if (append) {
					setTasks((prev) => [...prev, ...newTasks]);
				} else {
					setTasks(newTasks);
				}

				setHasMore(currentPage < lastPage);
			}
		} catch (error: any) {
			console.error("Error fetching tasks:", error);
			if (error?.response?.data) {
				console.error("API Error Details:", error.response.data);
			}
			setHasMore(false);
		} finally {
			setLoading(false);
			isLoadingRef.current = false;
		}
	}, [buildFilters, date_from, date_to, perPage]);

	useEffect(() => {
		setPage(1);
		fetchTasks(1, false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedStatus, selectedPriority, selectedDate, selectedUserId, date_from, date_to]);

	useEffect(() => {
		if (tasks.length > 0 && tasks.length < perPage) {
			const nextPage = page + 1;
			setPage(nextPage);
			fetchTasks(nextPage, true);
		}
	}, [perPage]);

	const handleScroll = useCallback(() => {
		const container = scrollContainerRef.current;
		if (!container || loading || !hasMore) return;

		const scrollTop = container.scrollTop;
		const scrollHeight = container.scrollHeight;
		const clientHeight = container.clientHeight;

		// Load more when within 100px of bottom
		if (scrollTop + clientHeight >= scrollHeight - 100) {
			const nextPage = page + 1;
			setPage(nextPage);
			fetchTasks(nextPage, true);
		}
	}, [page, loading, hasMore, fetchTasks]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (container) {
			container.addEventListener("scroll", handleScroll);
			return () => {
				container.removeEventListener("scroll", handleScroll);
			};
		}
	}, [handleScroll]);

	// Fetch task statistics on component mount and when selectedUserId changes
	useEffect(() => {
		const fetchTaskStatistics = async () => {
			setIsStatsLoading(true);
			try {
				const response = await dashboardApiRef.current.kpisTasks("ceo", selectedUserId, date_from, date_to);
				if (response?.data?.data) {
					setTaskStatsData(response.data.data);
				} else if (response?.data) {
					setTaskStatsData(response.data);
				} else {
					console.error("Invalid response format:", response);
				}
			} catch (error: any) {
				console.error("Error fetching task statistics:", error);
				if (error?.response?.data) {
					console.error("API Error Details:", error.response.data);
				}
			} finally {
				setIsStatsLoading(false);
			}
		};

		fetchTaskStatistics();
	}, [selectedUserId, date_from, date_to]);

	const getPriorityColor = (priority?: string) => {
		switch (priority?.toLowerCase()) {
			case 'highest':
				return getBadgeColor('red');
			case 'high':
				return getBadgeColor('orange');
			case 'normal':
				return getBadgeColor('cyan');
			case 'low':
				return getBadgeColor('violet');
			case 'lowest':
				return getBadgeColor('brown');
			default:
				return 'bg-primary-100 text-primary-700'
		}
	};

	const getStatusColor = (status?: string) => {
		switch (status?.toLowerCase()) {
			case 'not started':
				return getBadgeColor('brown');
			case 'delayed':
				return getBadgeColor('red');
			case 'ongoing':
				return getBadgeColor('blue');
			case 'awaiting input':
				return getBadgeColor('orange');
			default:
				return 'bg-primary-100 text-primary-700';
		}
	};

	const getTaskForTooltipContent = (task: any) => {
		if (!task.userable_id || !task.userable_type || !task.userable) return null;

		const type = task.userable_type.includes("\\")
			? task.userable_type.split("\\").pop()?.toLowerCase()
			: task.userable_type.toLowerCase();

		if (type === "contact") {
			return (
				<div className="flex flex-col gap-1.5 text-xs">
					<div className="font-semibold text-white mb-1">Contact Details</div>
					{task.userable.full_name && (
						<div className="flex gap-2">
							<span className="text-neutral-300 min-w-[60px]">Name:</span>
							<span className="text-white">{task.userable.full_name}</span>
						</div>
					)}
					{task.userable.phone && (
						<div className="flex gap-2">
							<span className="text-neutral-300 min-w-[60px]">Phone:</span>
							<span className="text-white">{task.userable.phone}</span>
						</div>
					)}
					{task.userable.email && (
						<div className="flex gap-2">
							<span className="text-neutral-300 min-w-[60px]">Email:</span>
							<span className="text-white">{task.userable.email}</span>
						</div>
					)}
					{task.userable.account_id && task.userable.account?.account_name && (
						<div className="flex gap-2">
							<span className="text-neutral-300 min-w-[60px]">Account:</span>
							<span className="text-white">{task.userable.account.account_name}</span>
						</div>
					)}
				</div>
			);
		} else if (type === "lead") {
			return (
				<div className="flex flex-col gap-1.5 text-xs">
					<div className="font-semibold text-white mb-1">Lead Details</div>
					{task.userable.full_name && (
						<div className="flex gap-2">
							<span className="text-neutral-300 min-w-[60px]">Name:</span>
							<span className="text-white">{task.userable.full_name}</span>
						</div>
					)}
					{task.userable.phone && (
						<div className="flex gap-2">
							<span className="text-neutral-300 min-w-[60px]">Phone:</span>
							<span className="text-white">{task.userable.phone}</span>
						</div>
					)}
					{task.userable.email && (
						<div className="flex gap-2">
							<span className="text-neutral-300 min-w-[60px]">Email:</span>
							<span className="text-white">{task.userable.email}</span>
						</div>
					)}
					{task.userable.company && (
						<div className="flex gap-2">
							<span className="text-neutral-300 min-w-[60px]">Company:</span>
							<span className="text-white">{task.userable.company}</span>
						</div>
					)}
				</div>
			);
		}
		return null;
	};

	const getModuleByTooltipContent = (task: any) => {
		if (!task.moduleable_id || !task.moduleable_type || !task.moduleable) return null;

		const type = task.moduleable_type.includes("\\")
			? task.moduleable_type.split("\\").pop()?.toLowerCase()
			: task.moduleable_type.toLowerCase();

		const details: JSX.Element[] = [];

		if (type === "account") {
			if (task.moduleable.account_name) details.push(
				<div key="name" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Name:</span>
					<span className="text-white">{task.moduleable.account_name}</span>
				</div>
			);
			if (task.moduleable.phone) details.push(
				<div key="phone" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Phone:</span>
					<span className="text-white">{task.moduleable.phone}</span>
				</div>
			);
			if (task.moduleable.email) details.push(
				<div key="email" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Email:</span>
					<span className="text-white">{task.moduleable.email}</span>
				</div>
			);
		} else if (type === "vendor") {
			if (task.moduleable.vendor_name) details.push(
				<div key="name" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Name:</span>
					<span className="text-white">{task.moduleable.vendor_name}</span>
				</div>
			);
			if (task.moduleable.phone) details.push(
				<div key="phone" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Phone:</span>
					<span className="text-white">{task.moduleable.phone}</span>
				</div>
			);
			if (task.moduleable.email) details.push(
				<div key="email" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Email:</span>
					<span className="text-white">{task.moduleable.email}</span>
				</div>
			);
		} else if (type === "quote") {
			if (task.moduleable.subject) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.subject}</span>
				</div>
			);
			if (task.moduleable.account?.account_name) details.push(
				<div key="account" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Account:</span>
					<span className="text-white">{task.moduleable.account.account_name}</span>
				</div>
			);
			if (task.moduleable.contact?.full_name) details.push(
				<div key="contact" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Contact:</span>
					<span className="text-white">{task.moduleable.contact.full_name}</span>
				</div>
			);
			if (task.moduleable.product?.product_name) details.push(
				<div key="product" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Product:</span>
					<span className="text-white">{task.moduleable.product.product_name}</span>
				</div>
			);
			if (task.moduleable.cost) details.push(
				<div key="cost" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Cost:</span>
					<span className="text-white">{task.moduleable.cost}</span>
				</div>
			);
			if (task.moduleable.quantity) details.push(
				<div key="quantity" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Quantity:</span>
					<span className="text-white">{task.moduleable.quantity}</span>
				</div>
			);
		} else if (type === "rfq") {
			if (task.moduleable.rfq_name) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.rfq_name}</span>
				</div>
			);
			if (task.moduleable.account?.account_name) details.push(
				<div key="account" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Account:</span>
					<span className="text-white">{task.moduleable.account.account_name}</span>
				</div>
			);
			if (task.moduleable.contact?.full_name) details.push(
				<div key="contact" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Contact:</span>
					<span className="text-white">{task.moduleable.contact.full_name}</span>
				</div>
			);
			if (task.moduleable.product?.product_name) details.push(
				<div key="product" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Product:</span>
					<span className="text-white">{task.moduleable.product.product_name}</span>
				</div>
			);
			if (task.moduleable.quantity) details.push(
				<div key="quantity" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Quantity:</span>
					<span className="text-white">{task.moduleable.quantity}</span>
				</div>
			);
		} else if (type === "excess") {
			if (task.moduleable.excess_name) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.excess_name}</span>
				</div>
			);
			if (task.moduleable.account?.account_name) details.push(
				<div key="account" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Account:</span>
					<span className="text-white">{task.moduleable.account.account_name}</span>
				</div>
			);
			if (task.moduleable.product?.product_name) details.push(
				<div key="product" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Product:</span>
					<span className="text-white">{task.moduleable.product.product_name}</span>
				</div>
			);
			if (task.moduleable.quantity) details.push(
				<div key="quantity" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Quantity:</span>
					<span className="text-white">{task.moduleable.quantity}</span>
				</div>
			);
		} else if (type === "availability") {
			if (task.moduleable.availability_name) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.availability_name}</span>
				</div>
			);
			if (task.moduleable.vendor?.vendor_name) details.push(
				<div key="vendor" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Vendor:</span>
					<span className="text-white">{task.moduleable.vendor.vendor_name}</span>
				</div>
			);
			if (task.moduleable.product?.product_name) details.push(
				<div key="product" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Product:</span>
					<span className="text-white">{task.moduleable.product.product_name}</span>
				</div>
			);
			if (task.moduleable.quantity) details.push(
				<div key="quantity" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Quantity:</span>
					<span className="text-white">{task.moduleable.quantity}</span>
				</div>
			);
		} else if (type === "product") {
			if (task.moduleable.product_name) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.product_name}</span>
				</div>
			);
			if (task.moduleable.manufacturer?.name) details.push(
				<div key="manufacturer" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Manufacturer:</span>
					<span className="text-white">{task.moduleable.manufacturer.name}</span>
				</div>
			);
			if (task.moduleable.product_active !== undefined) details.push(
				<div key="active" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Active:</span>
					<span className="text-white">{task.moduleable.product_active ? "Yes" : "No"}</span>
				</div>
			);
		} else if (type === "manufacturer") {
			if (task.moduleable.name) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.name}</span>
				</div>
			);
			if (task.moduleable.is_active !== undefined) details.push(
				<div key="active" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Active:</span>
					<span className="text-white">{task.moduleable.is_active ? "Yes" : "No"}</span>
				</div>
			);
		} else if (type === "salesorder") {
			if (task.moduleable.subject) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.subject}</span>
				</div>
			);
			if (task.moduleable.account?.account_name) details.push(
				<div key="account" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Account:</span>
					<span className="text-white">{task.moduleable.account.account_name}</span>
				</div>
			);
			if (task.moduleable.product?.product_name) details.push(
				<div key="product" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Product:</span>
					<span className="text-white">{task.moduleable.product.product_name}</span>
				</div>
			);
			if (task.moduleable.cost) details.push(
				<div key="cost" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Cost:</span>
					<span className="text-white">{task.moduleable.cost}</span>
				</div>
			);
			if (task.moduleable.quantity) details.push(
				<div key="quantity" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Quantity:</span>
					<span className="text-white">{task.moduleable.quantity}</span>
				</div>
			);
		} else if (type === "invoice") {
			if (task.moduleable.subject) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.subject}</span>
				</div>
			);
			if (task.moduleable.account?.account_name) details.push(
				<div key="account" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Account:</span>
					<span className="text-white">{task.moduleable.account.account_name}</span>
				</div>
			);
		} else if (type === "purchaseorder") {
			if (task.moduleable.subject) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.subject}</span>
				</div>
			);
			if (task.moduleable.vendor?.vendor_name) details.push(
				<div key="vendor" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Vendor:</span>
					<span className="text-white">{task.moduleable.vendor.vendor_name}</span>
				</div>
			);
			if (task.moduleable.product?.product_name) details.push(
				<div key="product" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Product:</span>
					<span className="text-white">{task.moduleable.product.product_name}</span>
				</div>
			);
		} else if (type === "vendorrfq") {
			if (task.moduleable.vendor_rfq_name) details.push(
				<div key="subject" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Subject:</span>
					<span className="text-white">{task.moduleable.vendor_rfq_name}</span>
				</div>
			);
			if (task.moduleable.vendor?.vendor_name) details.push(
				<div key="vendor" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Vendor:</span>
					<span className="text-white">{task.moduleable.vendor.vendor_name}</span>
				</div>
			);
			if (task.moduleable.status) details.push(
				<div key="status" className="flex gap-2">
					<span className="text-neutral-300 min-w-[60px]">Status:</span>
					<span className="text-white">{task.moduleable.status}</span>
				</div>
			);
		}

		if (details.length === 0) return null;

		const typeName = task.moduleable_type.includes("\\")
			? task.moduleable_type.split("\\").pop()
			: task.moduleable_type;

		return (
			<div className="flex flex-col gap-1.5 text-xs">
				<div className="font-semibold text-white mb-1">{typeName} Details</div>
				{details}
			</div>
		);
	};

	const handleCloseTask = async (taskId: string) => {

		await createSwalAlert("Close Task (Completed)", "warning", {
			text: "Are you sure you want to close this task?",
			showCancelButton: true,
			confirmButtonText: "Close Task",
			customClass: {
				confirmButton: "btn btn-warning",
				cancelButton: "custom-cancel-btn",
			},
		}).then(async result => {
			if (result.value) {
				try {
					const response = await taskApiRef.current.closeTask(taskId);
					if (response.isOk) {
						createSwalToast(response.data.message, "success");
						setTasks((prevTasks) => {
							return prevTasks.map((task) => {
								if (task.id === taskId) {
									// Use updated task data from API response if available, otherwise update status locally
									const updatedTask = response.data?.task || { ...task, status: "Completed" };
									return updatedTask;
								}
								return task;
							});
						});
					} else {
						console.error("Error closing task:", response);
						const errorMessage = response?.data?.message || "closing task failed";
						createSwalToast(errorMessage, "error");
					}
				} catch (error: any) {
					console.error("Error closing task:", error);
					const errorMessage = error?.response?.data?.message || "closing task failed";
					createSwalToast(errorMessage, "error");
				}
			}
		});
	};

	const activeFiltersCount = [selectedStatus, selectedPriority, selectedDate].filter(f => f !== "all").length;

	const StatCard = ({
		title,
		value,
		icon,
		iconColor,
		iconBgColor,
		isLoading: loading,
		to
	}: {
		title: string;
		value: number | undefined;
		icon: string;
		iconColor: string;
		iconBgColor: string;
		isLoading: boolean;
		to?: string;
	}) => {
		const content = (
			<div className={`flex flex-row items-center justify-between gap-2 p-1.5 bg-white border border-neutral-200 rounded-lg ${to ? "hover:bg-neutral-50 cursor-pointer transition-colors" : ""}`}>
				<div className="flex flex-row gap-1.5 items-center flex-1 min-w-0">
					<div className={`flex justify-center items-center ${iconBgColor} px-0.5 rounded-full w-5 h-5 flex-shrink-0`}>
						<Icon
							icon={icon}
							width={12}
							height={12}
							className={iconColor}
						/>
					</div>
					<div className="text-neutral-900 text-xs font-semibold truncate">{title}</div>
				</div>
				<div className="flex items-center flex-shrink-0">
					{loading ? (
						<div className="flex items-center animate-pulse">
							<span className="bg-neutral-200 text-transparent rounded w-10 h-3"></span>
						</div>
					) : (
						<div className="text-neutral-900 text-xs font-semibold">
							{value?.toLocaleString() || 0}
						</div>
					)}
				</div>
			</div>
		);

		if (to) {
			return (
				<Link to={to} target="_blank" className="block">
					{content}
				</Link>
			);
		}

		return content;
	};

	return (
		<div className="p-2 flex flex-col h-full">
			<div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-200">
				<div className="flex items-center gap-2.5">
					<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary-50 to-primary-100">
						<Icon
							icon="solar:clipboard-list-bold-duotone"
							width={18}
							height={18}
							className="text-primary-600"
						/>
					</div>
					<div className="flex flex-col">
						<h5 className="font-semibold text-base text-black leading-tight">Tasks</h5>
						<span className="text-[10px] text-neutral-500 font-normal leading-tight">Manage your assigned tasks</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{onToggleFullscreen && (
						<button
							onClick={onToggleFullscreen}
							className="p-1.5 hover:bg-neutral-100 rounded transition-colors"
							title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
						>
							<Icon
								icon={isFullscreen ? "solar:minimize-square-outline" : "solar:full-screen-square-outline"}
								width={16}
								height={16}
								className="text-neutral-600 hover:text-primary-600"
							/>
						</button>
					)}
				</div>
			</div>

			{/* Summary Statistics Row */}
			<div className="grid grid-cols-1 md:grid-cols-5 gap-1 mb-2">
				<StatCard
					title="Total"
					value={taskStatsData?.total_count}
					icon="solar:clipboard-list-bold-duotone"
					iconColor="text-primary-600"
					iconBgColor="bg-primary-50"
					isLoading={isStatsLoading}
					to="/task/list"
				/>
				<StatCard
					title="Ongoing"
					value={taskStatsData?.ongoing_count}
					icon="solar:play-circle-bold-duotone"
					iconColor="text-highlightColor-blue"
					iconBgColor="bg-highlightColor-blueLight"
					isLoading={isStatsLoading}
					to="/task/list?status=Ongoing"
				/>
				<StatCard
					title="Delayed"
					value={taskStatsData?.delayed_count}
					icon="solar:clock-circle-bold-duotone"
					iconColor="text-highlightColor-red"
					iconBgColor="bg-highlightColor-redLight"
					isLoading={isStatsLoading}
					to="/task/list?status=Delayed"
				/>
				<StatCard
					title="Not Started"
					value={taskStatsData?.not_started_count}
					icon="solar:pause-circle-bold-duotone"
					iconColor="text-highlightColor-brown"
					iconBgColor="bg-highlightColor-brownLight"
					isLoading={isStatsLoading}
					to="/task/list?status=Not Started"
				/>
				<StatCard
					title="Awaiting Input"
					value={taskStatsData?.awaiting_input_count}
					icon="solar:hourglass-bold-duotone"
					iconColor="text-highlightColor-orange"
					iconBgColor="bg-highlightColor-orangeLight"
					isLoading={isStatsLoading}
					to="/task/list?status=Awaiting Input"
				/>
			</div>

			{/* Pie Chart and Filters Row */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-1">
				{/* Pie Chart Section */}
				<div className="flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg">
					<div className="text-neutral-900 text-sm font-semibold mb-1">Status Distribution</div>
					{isStatsLoading ? (
						<div className="flex items-center justify-center py-8">
							<LoadingDots size="sm" />
						</div>
					) : (() => {
						// Check if there's meaningful data (at least one count > 0)
						const hasData = taskStatsData?.pie_chart_data &&
							taskStatsData.pie_chart_data.length > 0 &&
							taskStatsData.pie_chart_data.some(item => item.count > 0);

						if (!hasData) {
							return (
								<div className="flex flex-col items-center justify-center py-8">
									<div className="flex items-center justify-center w-20 h-20 rounded-full bg-neutral-100 mb-2">
										<Icon
											icon="solar:pie-chart-2-bold-duotone"
											width={32}
											height={32}
											className="text-neutral-400"
										/>
									</div>
									<div className="text-center">
										<p className="text-xs text-neutral-600 font-medium mb-0.5">No data available</p>
										<p className="text-[9px] text-neutral-500">No tasks in any status</p>
									</div>
								</div>
							);
						}

						return (
							<div className="flex flex-col items-center">
								<ResponsiveContainer width="100%" height={isFullscreen ? 250 : 120}>
									<PieChart>
										<Pie
											data={taskStatsData?.pie_chart_data?.map(item => ({
												name: item.status,
												value: item.count
											})) || []}
											cx="50%"
											cy="50%"
											outerRadius={isFullscreen ? 100 : 50}
											fill="#8884d8"
											dataKey="value"
										>
											{(taskStatsData?.pie_chart_data || []).map((entry, index) => (
												<Cell
													key={`cell-${index}`}
													fill={TASK_STATUS_COLORS[entry.status] || DEFAULT_COLOR}
													style={{ cursor: "pointer" }}
													onClick={() => {
														setSelectedStatus(selectedStatus === entry.status ? "all" : entry.status as FilterStatus);
													}}
												/>
											))}
										</Pie>
										<RechartsTooltip
											formatter={(value: number) => value.toLocaleString()}
											contentStyle={{
												fontSize: '8px',
												padding: '2px 4px',
												lineHeight: '1.2'
											}}
											itemStyle={{
												fontSize: '8px',
												padding: '0',
												margin: '0'
											}}
											labelStyle={{
												fontSize: '8px',
												marginBottom: '1px',
												padding: '0'
											}}
											wrapperStyle={{
												fontSize: '8px'
											}}
										/>
									</PieChart>
								</ResponsiveContainer>
								<div className="flex flex-wrap gap-1 justify-center mt-1">
									{(taskStatsData?.pie_chart_data || []).map((item) => (
										<div
											key={item.status}
											className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
											onClick={() => {
												setSelectedStatus(selectedStatus === item.status ? "all" : item.status as FilterStatus);
											}}
										>
											<div
												className={`w-2 h-2 rounded-full ${selectedStatus === item.status ? "ring-2 ring-primary-600 ring-offset-1" : ""}`}
												style={{ backgroundColor: TASK_STATUS_COLORS[item.status] || DEFAULT_COLOR }}
											/>
											<span className="text-[9px] text-neutral-600">{item.status}</span>
										</div>
									))}
								</div>
							</div>
						);
					})()}
				</div>

				{/* Compact Filter Header */}
				<div className={`md:col-span-3 flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg ${isFullscreen ? "min-h-[calc(100vh-300px)] max-h-[calc(100vh-300px)]" : "max-h-72 min-h-72"}`}>
					<div className="flex items-center justify-between mb-1">
						<div className="text-neutral-900 text-sm font-semibold">Filters</div>
						{activeFiltersCount > 0 && (
							<button
								onClick={() => {
									if (!loading) {
										setSelectedStatus("all");
										setSelectedPriority("all");
										setSelectedDate("all");
									}
								}}
								disabled={loading}
								className={`text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1 ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
							>
								<Icon icon="solar:close-circle-bold" width={14} />
								Clear filters ({activeFiltersCount})
							</button>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-1">
						{/* Status Filters */}
						<div className="flex items-center gap-0.5">
							<Icon icon="solar:list-check-bold" width={14} className={`text-neutral-400 ${loading ? "opacity-50" : ""}`} />
							{(["all", "Ongoing", "Delayed", "Not Started", "Awaiting Input"] as FilterStatus[]).map((status) => {
								const displayLabel = status === "all" ? "All" : status === "Not Started" ? "Not Started" : status === "Awaiting Input" ? "Awaiting Input" : status;
								return (
									<button
										key={status}
										onClick={() => !loading && setSelectedStatus(status)}
										disabled={loading}
										className={`px-1 py-0.5 rounded text-[10px] font-medium transition-colors ${loading ? "opacity-50 cursor-not-allowed" : ""} ${selectedStatus === status
											? getStatusColor(status?.toLowerCase())
											: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
											}`}
									>
										{displayLabel}
									</button>
								);
							})}
						</div>

						<div className="w-px h-4 bg-neutral-200 mx-0.5" />

						{/* Priority Filters */}
						<div className="flex items-center gap-0.5">
							<Icon icon="solar:flag-bold" width={14} className={`text-neutral-400 ${loading ? "opacity-50" : ""}`} />
							{(["all", "Highest", "High", "Normal", "Low", "Lowest"] as FilterPriority[]).map((priority) => {
								return (
									<button
										key={priority}
										onClick={() => !loading && setSelectedPriority(priority)}
										disabled={loading}
										className={`px-1 py-0.5 rounded text-[10px] font-medium transition-colors ${loading ? "opacity-50 cursor-not-allowed" : ""} ${selectedPriority === priority
											? getPriorityColor(priority?.toLowerCase())
											: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
											}`}
									>
										{priority === "all" ? "All" : priority}
									</button>
								);
							})}
						</div>

						<div className="w-px h-4 bg-neutral-200 mx-0.5" />

						{/* Date Filters */}
						<div className="flex items-center gap-0.5">
							<Icon icon="solar:calendar-bold" width={14} className={`text-neutral-400 ${loading ? "opacity-50" : ""}`} />
							{(["all", "today", "overdue", "upcoming"] as FilterDate[]).map((date) => (
								<button
									key={date}
									onClick={() => !loading && setSelectedDate(date)}
									disabled={loading}
									className={`px-1 py-0.5 rounded text-[10px] font-medium transition-colors ${loading ? "opacity-50 cursor-not-allowed" : ""} ${selectedDate === date
										? date === "all"
											? "bg-primary-100 text-primary-700"
											: date === "today"
												? "bg-blue-100 text-blue-700"
												: date === "overdue"
													? "bg-red-100 text-red-700"
													: "bg-blue-100 text-blue-700"
										: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
										}`}
								>
									{date === "all" ? "All" : date === "today" ? "Today" : date === "overdue" ? "Overdue" : "Upcoming"}
								</button>
							))}
						</div>
					</div>

					<div
						ref={scrollContainerRef}
						className="flex-1 overflow-y-auto pr-2 relative"
						style={{ scrollbarWidth: "thin" }}
					>
						{tasks.length === 0 && !loading ? (
							<div className="flex flex-col justify-center items-center text-center gap-4 h-full py-12 px-4">
								<div className="flex flex-col items-center gap-3">
									<div className="flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-neutral-50 to-neutral-100">
										<Icon
											icon="solar:clipboard-list-outline"
											width={40}
											height={40}
											className="text-neutral-300"
										/>
									</div>
									<div className="flex flex-col gap-1.5">
										<h4 className="text-neutral-900 font-semibold text-sm leading-tight">
											{activeFiltersCount > 0 ? "No tasks match your filters" : "No tasks available"}
										</h4>
										<p className="text-xs text-neutral-500 leading-tight max-w-xs">
											{activeFiltersCount > 0
												? "Try adjusting your filters to see more tasks, or clear all filters to view all tasks."
												: "You don't have any tasks assigned yet. New tasks will appear here once they're created."
											}
										</p>
									</div>
								</div>
							</div>
						) : (
							<div>
								{/* Initial loading indicator - centered */}
								{loading && tasks.length === 0 && (
									<div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
										<LoadingDots size="sm" />
									</div>
								)}

								{tasks.map((task) => (
									<div key={task.id} className="flex items-center gap-2 px-3 py-1 hover:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-b-0">
										{/* Priority Indicator */}
										<div className="flex-shrink-0">
											<div className={`flex items-center justify-center w-5 h-5 rounded font-semibold text-[10px]}`}>
												{task.priority === "Highest" ? <Icon icon="solar:double-alt-arrow-up-outline" width={16} height={16} className="!text-danger-500" /> 
												: task.priority === "High" ? <Icon icon="solar:alt-arrow-up-outline" width={16} height={16} className="text-[#FE7039]" />
												: task.priority === "Normal" ? <Icon icon="stash:equal" width={16} height={16} className="text-warning-400" />
												: task.priority === "Low" ? <Icon icon="solar:alt-arrow-down-outline" width={16} height={16} className="text-highlightColor-blue" />
												: task.priority === "Lowest" ? <Icon icon="solar:double-alt-arrow-down-outline" width={16} height={16} className="text-highlightColor-purple" />
												: "-"}
											</div>
										</div>

										{/* Task Subject */}
										<div className="flex-1 min-w-0">
											<ExpandableSubject subject={task.subject} taskId={task.id} />
										</div>

										{/* Owner - Fixed width column */}
										<div className="w-24 flex-shrink-0 flex items-center gap-1">
											{task.owner?.avatar_data ? (
												<img
													src={displayImage(task.owner.avatar_data)}
													alt={task.owner.name}
													className="w-3 h-3 rounded-full object-cover"
												/>
											) : (
												<div className="w-3 h-3 rounded-full bg-neutral-200 flex items-center justify-center">
													<Icon
														icon="solar:user-bold-duotone"
														width={8}
														height={8}
														className="text-neutral-400"
													/>
												</div>
											)}
											<span className="text-[9px] text-neutral-600 truncate">
												{task.owner?.name ? task.owner.name : "No Owner"}
											</span>
										</div>

										{/* Status Badge - Fixed width column */}
										<div className="w-16 flex-shrink-0 flex items-center justify-center">
											<div className={`flex items-center justify-center text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap w-full ${getStatusColor(task.status)}`}>
												{task.status}
											</div>
										</div>

										{/* Task For - Fixed width column */}
										<div className="w-20 flex-shrink-0 flex items-center justify-center">
											{task.userable_id && task.userable_type ? (
												<>
													<Link
														id={`task-for-${task.id}`}
														to={`/${formateName(task.userable_type)}/preview/${task.userable_id}`}
														className="text-[10px] font-semibold text-neutral-900 hover:text-primary-600 border-b-[1px] border-neutral-900 hover:border-primary-600 pb-0 truncate max-w-full"
													>
														{task.userable_type.includes("\\")
															? task.userable_type.split("\\").pop()
															: task.userable_type}
													</Link>
													{getTaskForTooltipContent(task) && (
														<Tooltip
															anchorSelect={`#task-for-${task.id}`}
															place="top"
															noArrow
															className="!bg-neutral-900 !text-white !rounded-lg !px-3 !py-2 !text-xs !z-50 !max-w-xs"
															delayShow={200}
														>
															{getTaskForTooltipContent(task)}
														</Tooltip>
													)}
												</>
											) : (
												<span className="text-[10px] text-neutral-400">-</span>
											)}
										</div>

										{/* Module Type - Fixed width column */}
										<div className="w-20 flex-shrink-0 flex items-center justify-center">
											{task.moduleable_id && task.moduleable_type ? (
												<>
													<Link
														id={`module-type-${task.id}`}
														to={`/${formateName(task.moduleable_type)}/preview/${task.moduleable_id}`}
														className="text-[10px] font-semibold text-neutral-900 hover:text-primary-600 border-b-[1px] border-neutral-900 hover:border-primary-600 pb-0 truncate max-w-full"
													>
														{task.moduleable_type.includes("\\")
															? task.moduleable_type.split("\\").pop()
															: task.moduleable_type}
													</Link>
													{getModuleByTooltipContent(task) && (
														<Tooltip
															anchorSelect={`#module-type-${task.id}`}
															place="top"
															noArrow
															className="!bg-neutral-900 !text-white !rounded-lg !px-3 !py-2 !text-xs !z-50 !max-w-xs"
															delayShow={200}
														>
															{getModuleByTooltipContent(task)}
														</Tooltip>
													)}
												</>
											) : (
												<span className="text-[10px] text-neutral-400">-</span>
											)}
										</div>

										{/* Reminder Icon - Fixed width column (always reserves space) */}
										<div className="w-8 flex-shrink-0 flex items-center justify-center">
											{task?.reminder !== 0 && task?.next_reminder_at ? (
												<>
													<div
														id={`reminder-icon-${task.id}`}
														className="flex items-center justify-center cursor-pointer"
													>
														<Icon
															icon="solar:bell-outline"
															width={12}
															height={12}
															className="text-neutral-400"
														/>
													</div>
													<Tooltip
														anchorSelect={`#reminder-icon-${task.id}`}
														place="top"
														noArrow
														className="!bg-neutral-900 !text-white !rounded-lg !px-3 !py-2 !text-xs !z-50"
														delayShow={200}
													>
														<div className="flex items-center gap-2">
															<Icon
																icon="solar:bell-outline"
																width={14}
																height={14}
																className="text-white"
															/>
															<span>
																Next reminder: {formatTime(task.next_reminder_at, 'task', { isUtc: true, withClock: true })}
															</span>
														</div>
													</Tooltip>
												</>
											) : null}
										</div>

										{/* Due Date - Fixed width column */}
										<div className="w-20 flex-shrink-0 flex items-center justify-start gap-1">
											<Icon
												icon="solar:calendar-outline"
												width={12}
												height={12}
												className="text-neutral-400 flex-shrink-0"
											/>
											<button
												onClick={() => {
													setSelectedTask(task);
													setDueDateModalOpen(true);
												}}
												className="text-[10px] text-neutral-600 whitespace-nowrap hover:text-primary-600 transition-colors flex items-center gap-1 group"
												title="Click to update due date"
											>
												<span>
													{task.due_date ? formatTime(task.due_date, 'task', { isUtc: true }) : '-'}
												</span>
												<Icon
													icon="solar:pen-outline"
													width={10}
													height={10}
													className="text-neutral-400 group-hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity"
												/>
											</button>
										</div>

										{/* Close Task Button - Fixed width column */}
										<div className="w-8 flex-shrink-0 flex items-center justify-center">
											{task.status !== "Completed" && (
												<button
													onClick={() => handleCloseTask(task.id)}
													className="p-1 hover:bg-warning-50 rounded transition-colors duration-200 group"
													title="Close task"
												>
													<Icon
														icon="solar:check-circle-bold-duotone"
														width={18}
														height={18}
														className="text-warning-600 group-hover:text-warning-700 transition-colors"
													/>
												</button>
											)}
										</div>
									</div>
								))}

								{/* Loading indicator at bottom when loading more items */}
								{loading && tasks.length > 0 && (
									<div className="flex items-center justify-center py-4">
										<LoadingDots size="sm" />
									</div>
								)}

								{/* End of list message */}
								{!hasMore && tasks.length > 0 && !loading && (
									<div className="text-neutral-400 text-xs text-center py-2">
										No more tasks
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Due Date Modal */}
			<DueDateModal
				isOpen={dueDateModalOpen}
				onClose={() => {
					setDueDateModalOpen(false);
					setSelectedTask(null);
				}}
				task={selectedTask}
				onSuccess={(updatedTask) => {
					// Update only the selected task in the tasks array
					if (selectedTask && updatedTask) {
						setTasks((prevTasks) => {
							const mergedTask = { ...selectedTask, ...updatedTask };
							// Check if the updated task matches the current filters
							if (taskMatchesFilters(mergedTask)) {
								// Update the task if it matches filters
								return prevTasks.map((task) => {
									if (task.id === selectedTask.id) {
										return mergedTask;
									}
									return task;
								});
							} else {
								// Remove the task if it doesn't match filters
								return prevTasks.filter((task) => task.id !== selectedTask.id);
							}
						});
					}
				}}
			/>
		</div>
	);
}
