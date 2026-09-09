import moment from "moment";
import { NavLink } from "react-router-dom";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import { createSwalToast } from "../../../helper/swalHelpers";
import LoadingSpinner from "../../../components/LoadingSpinner";
import React, { useState, useEffect, useMemo, useRef } from "react";
import GraphQLAPI from "../../../config/sub-apis/graphql.api";

interface AppointmentTimelineViewProps {
	filters: any;
	setFilters: (filters: any) => void;
	applyFilters: (params: any) => void;
	onCreateAppointment?: (prefillData: any) => void;
	onMarkComplete?: (appointment: any) => void;
	refreshKey?: number;
	ownerId?: number | null;
}

type AppointmentStatusType = "All" | "Planned" | "Completed" | "Cancelled";
type AccountTypeFilter = "All" | "Account" | "Vendor";

interface TimelineAppointment {
	id: number;
	appointment_subject: string;
	appointment_date: string;
	appointment_status: string;
	appointment_type: string;
	appointment_purpose: string;
}

interface TimelineGroup {
	id: string;
	appointmentable_type: string;
	appointmentable_id: number;
	appointmentable_name: string;
	appointmentable_industry?: string;
	appointmentable_location?: string;
	appointments_by_month: Record<string, TimelineAppointment[]>;
}

const AppointmentTimelineView: React.FC<AppointmentTimelineViewProps> = ({
	filters,
	setFilters,
	onCreateAppointment,
	onMarkComplete,
	refreshKey,
	ownerId,
}) => {
	const graphqlApi = new GraphQLAPI();
	const [selectedStatus, setSelectedStatus] = useState<AppointmentStatusType>("All");
	const [selectedType, setSelectedType] = useState<string | null>(null);
	const [viewedYear, setViewedYear] = useState<number>(moment().year());
	const [accountTypeFilter, setAccountTypeFilter] = useState<AccountTypeFilter>("All");
	const [searchTerm, setSearchTerm] = useState<string>("");
	const [loadingTable, setLoadingTable] = useState(false);
	const [timelineData, setTimelineData] = useState<TimelineGroup[]>([]);
	const [hoveredAppointment, setHoveredAppointment] = useState<string | null>(null);
	const isFetching = useRef(false);
	const filtersRef = useRef(filters);
	
	// Keep filtersRef in sync with filters prop
	useEffect(() => {
		filtersRef.current = filters;
	}, [filters]);

	// Appointment type options - for button filters
	const appointmentTypeOptions = [
		{ value: null, label: "All" },
		{ value: "on_site", label: "On-Site" },
		{ value: "virtual", label: "Virtual" },
	];

	// Status configuration
	const statusConfig = {
		All: { bgColor: "#21AB94", icon: "solar:checklist-bold" },
		Planned: { bgColor: "#3B82F6", icon: "codicon:circle-filled" },
		Completed: { bgColor: "#22C55E", icon: "codicon:circle-filled" },
		Cancelled: { bgColor: "#EF4444", icon: "codicon:circle-filled" },
	};

	// Generate quarters for the viewed year
	const getQuarters = () => {
		return [
			{ label: "Q1", months: [0, 1, 2], year: viewedYear },
			{ label: "Q2", months: [3, 4, 5], year: viewedYear },
			{ label: "Q3", months: [6, 7, 8], year: viewedYear },
			{ label: "Q4", months: [9, 10, 11], year: viewedYear },
		];
	};

	const quarters = getQuarters();
	const currentYear = moment().year();
	const currentQuarter = viewedYear === currentYear ? `Q${Math.floor(moment().month() / 3) + 1}` : null;

	// Generate month columns - always show all 12 months of viewed year
	const getMonthColumns = () => {
		const months: Array<{ key: string; label: string; month: number; year: number }> = [];

		// Always generate all 12 months of the viewed year (Jan-Dec)
		for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
			const date = moment().year(viewedYear).month(monthIndex);
			months.push({
				key: date.format("YYYY-MM"),
				label: date.format("MMM YYYY"),
				month: monthIndex,
				year: viewedYear,
			});
		}

		return months;
	};

	// Fetch timeline data
	const fetchTimelineData = async (
		statusOverride?: AppointmentStatusType,
		typeOverride?: string | null
	) => {
		if (isFetching.current) return;
		isFetching.current = true;

		try {
			setLoadingTable(true);
			
			// Use statusOverride if provided, otherwise use selectedStatus state
			const statusToUse = statusOverride !== undefined ? statusOverride : selectedStatus;
			const statusFilter = statusToUse !== "All" ? [statusToUse.toLowerCase()] : undefined;
			
			const typeToUse = typeOverride !== undefined ? typeOverride : selectedType;
			const typeFilter = typeToUse ? [typeToUse] : undefined;
			
			const input: any = {
				...(statusFilter && { status_filter: statusFilter }),
				...(typeFilter && { appointment_type_filter: typeFilter }),
				...(ownerId !== undefined && ownerId !== null && { owner_id: String(ownerId) }),
			};

			const res = await graphqlApi.gqlAppointmentTimeline(input);

			if (!res.errors && res.data?.appointmentTimeline?.data) {
				// Map to add id/appointmentable_name; useMemo handles array appointments_by_month
				const mapped = res.data.appointmentTimeline.data.map((g: any) => ({
					...g,
					id: `${g.appointmentable_type}_${g.appointmentable_id}`,
					appointmentable_name: g.appointments_by_month?.[0]?.appointments?.[0]?.appointmentable_name ?? "",
				}));
				setTimelineData(mapped as TimelineGroup[]);
			} else {
				createSwalToast(res.errors?.[0]?.message || "Error fetching timeline data", "error");
				setTimelineData([]);
			}
		} catch (error) {
			console.error("Error fetching timeline data:", error);
			createSwalToast("Error fetching timeline data", "error");
			setTimelineData([]);
		} finally {
			setLoadingTable(false);
			isFetching.current = false;
		}
	};

	// Apply status filter
	const handleStatusClick = (status: AppointmentStatusType) => {
		setSelectedStatus(status);

		const updatedFilters = { ...filtersRef.current };

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
		filtersRef.current = updatedFilters;
		setFilters(updatedFilters);
		fetchTimelineData(status);
	};

	// Apply type filter (All, On-Site, Virtual)
	const handleTypeChange = (typeValue: string | null) => {
		setSelectedType(typeValue);
		
		// Update filters for parent component
		const updatedFilters = { ...filtersRef.current };
		if (!typeValue) {
			delete updatedFilters.appointment_type;
		} else {
			updatedFilters.appointment_type = {
				field: "appointment_type",
				condition: "is",
				value: {
					options: [typeValue],
					fullOptions: [{ value: typeValue, label: typeValue }],
				},
				type: "select2_multiple",
			};
		}
		filtersRef.current = updatedFilters;
		setFilters(updatedFilters);
		fetchTimelineData(undefined, typeValue);
	};

	// Navigate to previous/next year
	const handlePreviousYear = () => {
		setViewedYear(prev => prev - 1);
	};

	const handleNextYear = () => {
		setViewedYear(prev => prev + 1);
	};

	const handleCurrentYear = () => {
		setViewedYear(moment().year());
	};

	// Update date filter when viewed year changes
	useEffect(() => {
		const updatedFilters = { ...filtersRef.current };
		
		const startDate = moment().year(viewedYear).startOf("year");
		const endDate = moment().year(viewedYear).endOf("year");
		
		updatedFilters.appointment_date = {
			field: "appointment_date",
			condition: "between",
			value: startDate.format("YYYY-MM-DD"),
			value2: endDate.format("YYYY-MM-DD"),
			type: "date",
		};

		setFilters(updatedFilters);
		fetchTimelineData();
	}, [viewedYear]);

	// Process timeline data
	const processedData = useMemo(() => {
		if (!timelineData || timelineData.length === 0) {
			return [];
		}

		// Filter by account type
		let filteredData = timelineData;
		if (accountTypeFilter !== "All") {
			const typeValue = accountTypeFilter === "Account" ? "App\\Models\\Account" : "App\\Models\\Vendor";
			filteredData = timelineData.filter((group: any) => group.appointmentable_type === typeValue);
		}
		
		// Map and prepare data
		const mappedData = filteredData.map((group: any) => {
				let relatedName = "-";
			let relatedType = "unknown";

				if (group.appointmentable) {
					if (group.appointmentable_type === "App\\Models\\Account") {
						relatedName = group.appointmentable.account_name || "-";
					relatedType = "account";
					} else if (group.appointmentable_type === "App\\Models\\Vendor") {
						relatedName = group.appointmentable.vendor_name || "-";
					relatedType = "vendor";
				}
			} else if (group.appointmentable_name) {
				relatedName = group.appointmentable_name;
				relatedType = group.appointmentable_type?.includes("Account") ? "account" : "vendor";
			}

			// Transform appointments_by_month from array to object if needed
			let appointmentsByMonth: Record<string, any[]> = {};
			if (Array.isArray(group.appointments_by_month)) {
				// API returns array format: [{month: "2026-01", appointments: [...]}]
					group.appointments_by_month.forEach((monthData: any) => {
						if (monthData.month && monthData.appointments) {
							appointmentsByMonth[monthData.month] = monthData.appointments;
						}
					});
			} else {
				// Already in object format
				appointmentsByMonth = group.appointments_by_month || {};
				}

				return {
				id: `${group.appointmentable_type || ""}_${group.appointmentable_id || ""}`,
				appointmentable_id: group.appointmentable_id,
				appointmentable_type: group.appointmentable_type,
					relatedTo: relatedName,
				relatedType: relatedType,
				industry: group.appointmentable?.industry || "",
				location: group.appointmentable?.billing_city || group.appointmentable?.city || "",
				appointments_by_month: appointmentsByMonth,
			};
		});

		// Filter by search term
		if (searchTerm.trim()) {
			const searchLower = searchTerm.toLowerCase().trim();
			return mappedData.filter((record: any) => {
				// Search in account/vendor name
				const nameMatch = record.relatedTo?.toLowerCase().includes(searchLower);
				
				// Search in all appointments' contact names
				const appointmentMatch = Object.values(record.appointments_by_month).some((appointments: any) =>
					appointments.some((appointment: any) => {
						// Check contact attendees
						const contactMatch = appointment.contact_attendees?.some((contact: any) =>
							contact.name?.toLowerCase().includes(searchLower)
						);
						// Check internal attendees
						const internalMatch = appointment.internal_attendees_details?.some((attendee: any) =>
							(attendee.name || `${attendee.first_name || ''} ${attendee.last_name || ''}`).trim().toLowerCase().includes(searchLower)
						);
						return contactMatch || internalMatch;
					})
				);
				
				return nameMatch || appointmentMatch;
			});
		}

		return mappedData;
	}, [timelineData, accountTypeFilter, searchTerm]);

	// Get month columns
	const monthColumns = useMemo(() => {
		return getMonthColumns();
	}, [viewedYear]);

	// Get appointment icon (outline versions)
	const getAppointmentIcon = (status: string, appointmentType: string) => {
		if (status === "completed") return "solar:check-circle-outline";
		if (status === "cancelled") return "solar:close-circle-outline";
		return appointmentType === "virtual" ? "solar:videocamera-record-outline" : "solar:map-point-outline";
	};

	// Get appointment color
	const getAppointmentColor = (status: string) => {
		switch (status) {
			case "completed":
				return "text-green-600";
			case "cancelled":
				return "text-red-600";
			case "planned":
				return "text-blue-600";
			default:
				return "text-neutral-400";
		}
	};

	// Get position in quarter
	const getPositionInQuarter = (date: moment.Moment, quarter: string) => {
		const month = date.month();
		const day = date.date();

		let quarterStartMonth = 0;
		if (quarter === "Q2") quarterStartMonth = 3;
		if (quarter === "Q3") quarterStartMonth = 6;
		if (quarter === "Q4") quarterStartMonth = 9;

		const monthInQuarter = month - quarterStartMonth;
		const daysIntoQuarter = monthInQuarter * 30 + day;
		const totalDaysInQuarter = 90;

		return (daysIntoQuarter / totalDaysInQuarter) * 100;
	};

	// Get appointments for account and quarter
	const getAppointmentsForQuarter = (record: any, quarter: typeof quarters[0]) => {
		const appointments: any[] = [];
		quarter.months.forEach(month => {
			const monthKey = `${quarter.year}-${String(month + 1).padStart(2, "0")}`;
			const monthAppointments = record.appointments_by_month?.[monthKey] || [];
			appointments.push(...monthAppointments);
		});
		return appointments;
	};

	useEffect(() => {
		// Initialize selectedStatus from filters if present
		if (filters.appointment_status?.value?.options?.[0]) {
			const statusFromFilter = filters.appointment_status.value.options[0];
			const capitalizedStatus = statusFromFilter.charAt(0).toUpperCase() + statusFromFilter.slice(1);
			console.log("3. Found status in filters:", statusFromFilter, "->", capitalizedStatus);
			if (["All", "Planned", "Completed", "Cancelled"].includes(capitalizedStatus)) {
				setSelectedStatus(capitalizedStatus as AppointmentStatusType);
			}
		} else {
			console.log("3. No status filter found in initial filters");
		}
		
		// Initialize filtersRef
		filtersRef.current = filters;
		console.log("4. Initialized filtersRef.current:", filtersRef.current);
		console.log("=== useEffect (initial mount) END ===");
	}, [refreshKey]);

	return (
		<div className="datatables pagination-padding m-3 border border-neutral-200 rounded-lg bg-white overflow-visible">
			{/* Header Filters */}
			<div className="flex items-center justify-between gap-4 p-4 border-b border-neutral-200">
				{/* Status Radio Buttons */}
				<div className="flex items-center gap-2 flex-shrink-0">
					{(Object.keys(statusConfig) as AppointmentStatusType[]).map((status, index) => (
						<React.Fragment key={status}>
							<button
								type="button"
								onClick={() => handleStatusClick(status)}
								className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
									selectedStatus === status
										? `text-white`
										: "bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
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

				{/* Search Box */}
				<div className="flex-1 max-w-md">
					<div className="relative">
						<Icon
							icon="solar:magnifer-bold-duotone"
							width={18}
							className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400"
						/>
						<input
							type="text"
							placeholder="Search by account, vendor, or contact name..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="w-full pl-10 pr-4 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
						/>
						{searchTerm && (
							<button
								onClick={() => setSearchTerm("")}
								className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
							>
								<Icon icon="solar:close-circle-bold" width={18} />
							</button>
						)}
					</div>
				</div>

				{/* Right Side Filters */}
				<div className="flex items-center gap-3 flex-shrink-0">
					{/* Account Type Filter (All, Account, Vendor) */}
					<div className="flex items-center bg-neutral-100 rounded-lg p-1">
						{(["All", "Account", "Vendor"] as AccountTypeFilter[]).map(type => (
							<button
								key={type}
								onClick={() => setAccountTypeFilter(type)}
								className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
									accountTypeFilter === type
										? "bg-white text-primary-600 shadow-sm"
										: "text-neutral-600 hover:text-neutral-900"
								}`}
							>
								{type}
							</button>
						))}
					</div>

					{/* Appointment Type Filter (All, On-Site, Virtual) */}
					<div className="flex items-center bg-neutral-100 rounded-lg p-1">
						{appointmentTypeOptions.map(type => (
							<button
								key={type.value || "all"}
								onClick={() => handleTypeChange(type.value)}
								className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
									selectedType === type.value
										? "bg-white text-primary-600 shadow-sm"
										: "text-neutral-600 hover:text-neutral-900"
								}`}
							>
								{type.label}
							</button>
						))}
					</div>
					{/* Year Navigation */}
					<div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
						<button
							type="button"
							onClick={handlePreviousYear}
							className="p-1 hover:bg-gray-200 rounded transition-colors"
							title="Previous Year"
						>
							<Icon icon="solar:alt-arrow-left-bold" width={20} className="text-gray-600" />
						</button>
						<div className="flex items-center gap-2 min-w-[120px] justify-center">
							<span className="text-sm font-semibold text-gray-900">{viewedYear}</span>
							{viewedYear !== currentYear && (
								<button
									type="button"
									onClick={handleCurrentYear}
									className="text-xs text-blue-600 hover:text-blue-800 font-medium"
									title="Jump to Current Year"
								>
									Today
								</button>
							)}
						</div>
						<button
							type="button"
							onClick={handleNextYear}
							className="p-1 hover:bg-gray-200 rounded transition-colors"
							title="Next Year"
						>
							<Icon icon="solar:alt-arrow-right-bold" width={20} className="text-gray-600" />
						</button>
					</div>
				</div>
			</div>

			{/* Timeline Grid */}
			{loadingTable ? (
				<div className="flex justify-center items-center p-8">
					<LoadingSpinner />
				</div>
			) : (
				<div className="overflow-y-visible">
					{/* Quarter Headers */}
					<div className="grid grid-cols-[280px_repeat(4,minmax(200px,1fr))_60px] border-b border-neutral-200 sticky top-0 bg-white z-10">
						<div className="px-4 py-3 font-medium text-sm text-neutral-700">Account / Vendor</div>
						{quarters.map(quarter => {
							const isCurrentQuarter = quarter.label === currentQuarter;
							const todayPosition = isCurrentQuarter ? getPositionInQuarter(moment(), quarter.label) : null;
							return (
								<div
									key={quarter.label}
									className="py-3 text-center font-medium text-sm text-neutral-700 border-l border-neutral-200 relative"
								>
									{quarter.label} {quarter.year}
									{isCurrentQuarter && todayPosition !== null && (
										<div 
											className="absolute -bottom-3 bg-red-500 text-white text-xs px-2 py-0.5 rounded shadow-lg z-20"
											style={{ left: `${Math.min(Math.max(todayPosition, 0), 100)}%`, transform: 'translateX(-50%)' }}
										>
											TODAY
										</div>
									)}
								</div>
							);
						})}
						<div className="border-l border-neutral-200"></div>
					</div>

					{/* Timeline Rows */}
					{processedData.length === 0 ? (
						<div className="text-center py-8 text-neutral-500">
							<Icon icon="solar:calendar-search-outline" width={48} className="mx-auto mb-2" />
							<p>No appointments found for this period</p>
						</div>
					) : (
						processedData.map((record, rowIndex) => {
							const totalRows = processedData.length;
							const isLastRow = rowIndex === totalRows - 1;
							const isSecondLastRow = rowIndex === totalRows - 2;
							const shouldShowTooltipAbove = totalRows > 3 ? rowIndex >= 2 : false;
							
							return (
							<div
								key={record.id}
								className="grid grid-cols-[280px_repeat(4,minmax(200px,1fr))_60px] border-b border-neutral-200 hover:bg-neutral-50 transition-colors"
							>
								{/* Account/Vendor Info */}
								<div className="px-4 py-4 flex items-start gap-3">
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2 mb-1">
											<NavLink
												to={`/${record.relatedType}/preview/${record.appointmentable_id}`}
												className="font-medium text-sm text-neutral-900 truncate hover:underline"
											>
												{record.relatedTo}
											</NavLink>
											<span
												className={`px-2 py-0.5 text-xs rounded ${
													record.relatedType === "account"
														? "bg-primary-100 text-primary-700"
														: "bg-orange-100 text-orange-700"
												}`}
											>
												{record.relatedType}
											</span>
										</div>
										{record.industry && (
											<p className="text-xs text-neutral-600 truncate mb-1">{record.industry}</p>
										)}
										{record.location && (
											<p className="text-xs text-neutral-600 truncate">{record.location}</p>
										)}
									</div>
								</div>

								{/* Quarter Columns */}
								{quarters.map(quarter => {
									const quarterAppointments = getAppointmentsForQuarter(record, quarter);
									const isCurrentQuarter = quarter.label === currentQuarter;
									const todayPosition = isCurrentQuarter ? getPositionInQuarter(moment(), quarter.label) : null;
									const hasActiveTooltip = quarterAppointments.some((v: any) => `${record.id}_${v.id}` === hoveredAppointment);
									
									return (
										<div
											key={quarter.label}
											className={`py-4 border-l border-neutral-200 relative flex items-center ${
												hasActiveTooltip ? 'z-[99996]' : 'z-0'
											}`}
											style={{ overflow: 'visible' }}
										>
											{isCurrentQuarter && todayPosition !== null && (
												<div 
													className="absolute inset-y-0 w-0.5 bg-red-500 z-10 opacity-30"
													style={{ left: `${Math.min(Math.max(todayPosition, 0), 100)}%` }}
												></div>
											)}

											<div className="relative w-full h-1.5 bg-neutral-200">
												{quarterAppointments.map((appointment: any, idx: number) => {
													const appointmentDate = moment(appointment.appointment_date);
													const position = getPositionInQuarter(appointmentDate, quarter.label);
													const appointmentId = `${record.id}_${appointment.id}`;

													return (
														<div
															key={appointment.id}
															className={`absolute -top-3 transform -translate-x-1/2 ${
																hoveredAppointment === appointmentId ? 'z-[99997]' : 'z-10'
															}`}
															style={{ left: `${Math.min(Math.max(position, 5), 95)}%` }}
															onMouseEnter={() => setHoveredAppointment(appointmentId)}
															onMouseLeave={(e) => {
																// Only hide if not moving to the tooltip
																const relatedTarget = e.relatedTarget as HTMLElement;
																if (!relatedTarget?.closest('.appointment-tooltip')) {
																	setHoveredAppointment(null);
																}
															}}
														>
															<NavLink to={`/appointment/preview/${appointment.id}`}>
																<div className="relative flex items-center justify-center">
																	<div className="w-6 h-6 rounded-full border-2 border-neutral-300 bg-white flex items-center justify-center">
																		<Icon
																			icon={getAppointmentIcon(appointment.appointment_status, appointment.appointment_type)}
																			width={14}
																			className={`cursor-pointer hover:scale-110 transition-transform ${getAppointmentColor(
																				appointment.appointment_status
																			)}`}
																		/>
																	</div>
																</div>
															</NavLink>

															{/* Tooltip */}
															{hoveredAppointment === appointmentId && (
																<>
																	{/* Invisible bridge to prevent tooltip from disappearing */}
																	<div 
																		className={`absolute left-1/2 transform -translate-x-1/2 w-80 z-[99998] pointer-events-auto ${
																			shouldShowTooltipAbove ? 'bottom-full h-4' : 'top-full h-4'
																		}`}
																		onMouseEnter={() => setHoveredAppointment(appointmentId)}
																		style={{ backgroundColor: 'transparent' }}
																	/>
																	<div 
																		className={`appointment-tooltip absolute left-1/2 transform -translate-x-1/2 w-80 bg-white rounded-lg shadow-xl border border-neutral-200 p-4 z-[99999] ${
																			shouldShowTooltipAbove ? 'bottom-full mb-2' : 'top-full mt-2'
																		}`}
																		onMouseEnter={() => setHoveredAppointment(appointmentId)}
																		onMouseLeave={() => setHoveredAppointment(null)}
																	>
																	<div className="flex items-center gap-2 mb-3">
																		<span
																			className={`px-2 py-0.5 text-xs font-medium rounded text-white ${
																				appointment.appointment_status === "completed"
																					? "bg-green-600"
																					: appointment.appointment_status === "cancelled"
																					? "bg-red-600"
																					: "bg-blue-600"
																			}`}
																		>
																			{appointment.appointment_status?.toUpperCase()}
																		</span>
																		<span className="text-xs text-neutral-600">
																			{appointmentDate.format("MMM D, YYYY")}
																		</span>
																		<span
																			className={`px-2 py-0.5 text-xs rounded ${
																				appointment.appointment_type === "on_site"
																					? "bg-blue-100 text-blue-700"
																					: "bg-purple-100 text-purple-700"
																			}`}
																		>
																			{appointment.appointment_type === "on_site" ? "On-Site" : "Virtual"}
																		</span>
																	</div>

																	<h4 className="text-sm font-semibold text-neutral-900 mb-2">
																		{appointment.subject}
																	</h4>

																	<p className="text-xs text-neutral-600 mb-1">
																		Purpose:{" "}
																		<span className="font-medium capitalize">
																			{appointment.appointment_purpose?.replace("_", " ")}
																		</span>
																	</p>

																	{appointment.owner && (
																		<p className="text-xs text-neutral-600 mb-1">
																			Owner:{" "}
																			<span className="font-medium">
																				{appointment.owner?.first_name} {appointment.owner?.last_name}
																			</span>
																		</p>
																	)}

																	{appointment.location && (
																		<p className="text-xs text-neutral-600 mb-1">
																			Location: {appointment.location}
																		</p>
																	)}

																	{appointment.duration_minutes && (
																		<p className="text-xs text-neutral-600 mb-1">
																			Duration: {appointment.duration_minutes} minutes
																		</p>
																	)}

																	{appointment.appointment_outcome && (
																		<p className="text-xs text-neutral-600 mb-1">
																			Outcome:{" "}
																			<span className="font-medium capitalize">
																				{appointment.appointment_outcome.replace(/_/g, " ")}
																			</span>
																		</p>
																	)}

																	{appointment.note && (
																		<p className="text-xs text-neutral-600 mt-2 pt-2 border-t border-neutral-100 line-clamp-2">
																			Note:{" "}
																			{appointment.note}
																		</p>
																	)}

																	{/* Mark Complete Button */}
																	{appointment.appointment_status === "planned" && 
																		appointmentDate.isBefore(moment(), 'day') && 
																		onMarkComplete && (
																		<div className="mt-3 pt-3 border-t border-neutral-100">
																			<button
																				onClick={(e) => {
																					e.preventDefault();
																					e.stopPropagation();
																					onMarkComplete(appointment);
																				}}
																				className="w-full px-3 py-2 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
																			>
																				<Icon icon="solar:check-circle-bold" width={14} />
																				Mark as Complete
																			</button>
																		</div>
																	)}
																	</div>
																</>
															)}
														</div>
													);
												})}
											</div>
										</div>
									);
								})}

								{/* Add Button */}
								<div className="px-3 py-4 border-l border-neutral-200 flex items-center justify-center">
									<button
										onClick={() => onCreateAppointment?.({
											appointmentable_type: record.appointmentable_type,
											appointmentable_id: record.appointmentable_id,
											appointmentable_name: record.relatedTo,
										})}
										className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
									>
										<Icon icon="solar:add-circle-outline" width={20} />
									</button>
								</div>
							</div>
						);
						})
					)}
				</div>
			)}
		</div>
	);
};

export default AppointmentTimelineView;
