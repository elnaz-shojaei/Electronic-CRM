import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardAPI from "../../../../config/sub-apis/dashboard.api";
import { useUserStatus } from "../../../../config/authCheck";
import { formatNumberWithCurrency } from "../../../../helper/fieldsHelper";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import RevenueComparisonSection from "./revenue-comparison/RevenueComparisonSection";
import { getToken } from "@/config/config";

interface BookingAndBillingProps {
	isFullscreen?: boolean;
	onToggleFullscreen?: () => void;
	date_from?: string;
	date_to?: string;
	globalUserId?: number;
}

interface PeriodData {
	total?: number;
	count?: number;
}

interface ChangeData {
	amount_percentage?: number;
	amount_increase?: boolean;
	count_percentage?: number;
	count_increase?: boolean;
}

interface BookingPeriodData {
	current?: PeriodData;
	previous?: PeriodData;
	change?: ChangeData;
	currency?: string;
	forecast?: {
		sales_person_forecast?: number | null;
		sales_person_difference?: number;
		account_forecast?: number;
		account_difference?: number;
	};
}

interface BookingPeriodDataWithChart extends BookingPeriodData {
	chart: {
		labels: string[];
		datasets: {
			label: string;
			data: number[];
		}[];
	};
}

interface BillingPeriodData {
	current?: PeriodData;
	previous?: PeriodData;
	change?: ChangeData;
	realized?: number;
	currency?: string;
}

interface BillingPeriodDataWithChart extends BillingPeriodData {
	chart: {
		labels: string[];
		datasets: {
			label: string;
			data: number[];
		}[];
	};
}

interface BacklogPeriodData {
	current?: PeriodData;
	previous?: PeriodData;
	change?: ChangeData;
	currency?: string;
}

interface ForecastPeriodData {
	account_forecast?: {
		forecast?: number;
		realized?: number;
		difference?: number;
	};
	sales_person_forecast?: {
		forecast?: number;
		realized?: number;
		difference?: number;
	};
	currency?: string;
	year?: number;
}

interface RevenueData {
	booking: {
		mtd: BookingPeriodDataWithChart;
		ytd: BookingPeriodDataWithChart;
	};
	billing: {
		mtd: BillingPeriodDataWithChart;
		ytd: BillingPeriodDataWithChart;
	};
	backlog: {
		mtd: BacklogPeriodData;
		ytd: BacklogPeriodData;
	};
	forecast: {
		mtd: ForecastPeriodData;
		ytd: ForecastPeriodData;
	};
}

export default function BookingAndBilling({ isFullscreen = false, onToggleFullscreen, globalUserId, date_from, date_to }: BookingAndBillingProps) {
	const dashboardApi = new DashboardAPI();
	const userData = getToken("userData");
	const canViewDeveloperRevenueCards = !!userData?.is_developer;
	const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);

	useEffect(() => {
		setSelectedUserId(globalUserId);
	}, [globalUserId]);

	// Fetch all revenue data (booking, billing, backlog, forecast) in a single call
	const revenueQuery = useQuery<RevenueData>({
		queryKey: ["revenue", "ceo", selectedUserId],
		queryFn: async (): Promise<RevenueData> => {
			const result = await dashboardApi.kpisRevenue("ceo", selectedUserId);
			return result.data.data as RevenueData;
		},
		enabled: true,
	});

	// Transform chart data from API format to Recharts format
	const transformChartData = (chartData: { labels: string[]; datasets: { label: string; data: number[] }[] } | undefined) => {
		if (!chartData?.labels || !chartData?.datasets) return [];
		
		return chartData.labels.map((label, index) => {
			const dataPoint: any = { label };
			chartData.datasets.forEach(dataset => {
				dataPoint[dataset.label.toLowerCase()] = dataset.data[index] || 0;
			});
			return dataPoint;
		});
	};

	const BookingCard = ({
		title,
		period,
		iconColor,
		iconBgColor
	}: {
		title: string;
		period: "mtd" | "ytd";
		iconColor: string;
		iconBgColor: string;
	}) => {
		const isLoading = revenueQuery.isLoading || revenueQuery.isFetching;
		const data = revenueQuery.data?.booking?.[period];
		const forecastData = revenueQuery.data?.forecast?.[period];

		return (
			<div className="flex flex-col justify-between gap-2 p-2 bg-white border border-neutral-200 rounded-lg">
				{/* Header */}
				<div className="flex justify-between items-center gap-1.5">
					<div className="flex flex-row gap-1.5 justify-start items-center">
						<div className={`flex justify-center items-center ${iconBgColor} px-1 rounded-full w-6 h-6`}>
							<Icon
								icon="solar:diagram-up-outline"
								width={14}
								height={14}
								className={iconColor}
							/>
						</div>
						<div className="text-black text-[10px] font-semibold">{title}</div>
					</div>
					{/* Change percentage */}
					{!isLoading && data?.change && (
						<div className="inline-flex flex-col justify-center items-center gap-0.5">
							<div className="inline-flex justify-start items-center gap-0.5">
								<span className="text-neutral-700 text-[9px] font-normal leading-none">Amount:</span>
								<span className="text-neutral-900 text-[9px] font-normal leading-none">
									{formatNumberWithCurrency(data.change.amount_percentage, undefined, {
										decimalScaleValue: 0,
										stringExport: true,
										otherSign: "%",
										isReportValue: true,
									})}
									{data.change.amount_increase ? (
										<Icon icon="solar:course-up-bold" className="text-success-500 text-[9px] ml-0.5" width={9} />
									) : (
										<Icon icon="solar:course-down-bold" className="text-danger-500 text-[9px] ml-0.5" width={9} />
									)}
								</span>
							</div>
							<div className="inline-flex justify-start items-center gap-0.5">
								<span className="text-neutral-700 text-[9px] font-normal leading-none">Count:</span>
								<span className="text-neutral-900 text-[9px] font-normal leading-none">
									{formatNumberWithCurrency(data.change.count_percentage, undefined, {
										decimalScaleValue: 0,
										stringExport: true,
										otherSign: "%",
										isReportValue: true,
									})}
									{data.change.count_increase ? (
										<Icon icon="solar:course-up-bold" className="text-success-500 text-[9px] ml-0.5" width={9} />
									) : (
										<Icon icon="solar:course-down-bold" className="text-danger-500 text-[9px] ml-0.5" width={9} />
									)}
								</span>
							</div>
						</div>
					)}
				</div>

				{/* Current Period Stats - horizontal */}
				<div className="flex flex-row items-center justify-start gap-2">
					<div className="inline-flex flex-row items-center justify-start gap-1">
						<div className="justify-start text-neutral-900 text-[9px] font-normal leading-none capitalize">
							This {title.includes("MTD") ? "Month" : "Year"}:
						</div>
						{isLoading ? (
							<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
								<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
								<span className="bg-neutral-200 text-transparent rounded w-4 h-3"></span>
							</div>
						) : (
							<div className="flex flex-row items-center justify-start gap-0.5 text-neutral-900 text-xs font-semibold">
								{formatNumberWithCurrency(data?.current?.total, data?.currency, {
									decimalScaleValue: 0,
									stringExport: true,
									isReportValue: true
								})}
								<span className="text-[9px] font-normal text-neutral-600">
									({formatNumberWithCurrency(data?.current?.count, undefined, {
										decimalScaleValue: 0,
										stringExport: true,
										isReportValue: true
									})})
								</span>
							</div>
						)}
					</div>
					<div className="inline-flex flex-row items-center justify-start gap-1">
						<div className="justify-start text-neutral-900 text-[9px] font-normal leading-none capitalize">
							Previous {title.includes("MTD") ? "Month" : "Year"}:
						</div>
						{isLoading ? (
							<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
								<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
								<span className="bg-neutral-200 text-transparent rounded w-4 h-3"></span>
							</div>
						) : (
							<div className="flex flex-row items-center justify-start gap-0.5 text-neutral-900 text-xs font-semibold">
								{formatNumberWithCurrency(data?.previous?.total, data?.currency, {
									decimalScaleValue: 0,
									stringExport: true,
									isReportValue: true
								})}
								<span className="text-[9px] font-normal text-neutral-600">
									({formatNumberWithCurrency(data?.previous?.count, undefined, {
										decimalScaleValue: 0,
										stringExport: true,
										isReportValue: true
									})})
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Forecast Stats - horizontal */}
				<div className="flex flex-row items-center justify-start gap-2 mt-2">
					<div className="inline-flex flex-row items-center justify-start gap-1">
						<div className="justify-start text-neutral-900 text-[9px] font-normal leading-none">
							Accounts Forecast:
						</div>
						{isLoading ? (
							<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
								<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
							</div>
						) : (
							<div className="flex flex-row items-center justify-start gap-0.5 text-neutral-900 text-xs font-semibold">
								{formatNumberWithCurrency(data?.forecast?.account_forecast, data?.currency, {
									decimalScaleValue: 0,
									stringExport: true,
									isReportValue: true
								})}
							</div>
						)}
					</div>

					<div className="inline-flex flex-row items-center justify-start gap-1">
						<div className="justify-start text-neutral-900 text-[9px] font-normal leading-none">
							Difference:
						</div>
						{isLoading ? (
							<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
								<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
							</div>
						) : (
							<div className={`flex flex-row items-center justify-start gap-0.5  text-xs font-semibold ${(data?.forecast?.account_difference ?? 0) > 0 ? "text-success-500" : "text-danger-500"}`}>
								{formatNumberWithCurrency(data?.forecast?.account_difference, data?.currency, {
									decimalScaleValue: 0,
									stringExport: true,
									isReportValue: true
								})}
							</div>
						)}
					</div>
				</div>

				{/* Chart Section */}
				<div className="mt-3 pt-2 border-t border-neutral-100">
					{isLoading ? (
						<div className="w-full h-[240px] flex flex-col gap-2">
							{/* Legend skeleton */}
							<div className="flex items-center justify-center gap-4 pb-2">
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 bg-neutral-200 rounded animate-pulse"></div>
									<div className="w-12 h-3 bg-neutral-200 rounded animate-pulse"></div>
								</div>
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 bg-neutral-200 rounded animate-pulse"></div>
									<div className="w-12 h-3 bg-neutral-200 rounded animate-pulse"></div>
								</div>
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 bg-neutral-200 rounded animate-pulse"></div>
									<div className="w-12 h-3 bg-neutral-200 rounded animate-pulse"></div>
								</div>
							</div>
							{/* Chart area skeleton */}
							<div className="flex-1 flex items-end justify-between gap-2 px-4 pb-2">
								{Array.from({ length: 8 }).map((_, i) => {
									const heights = [
										[70, 60, 50],
										[85, 75, 65],
										[60, 50, 40],
										[90, 80, 70],
										[55, 45, 35],
										[75, 65, 55],
										[65, 55, 45],
										[80, 70, 60],
									];
									const [h1, h2, h3] = heights[i % heights.length];
									return (
										<div key={i} className="flex-1 flex flex-col items-center gap-1">
											<div className="w-full flex flex-col items-center gap-1 justify-end" style={{ height: '160px' }}>
												<div 
													className="w-full bg-neutral-200 rounded-t animate-pulse" 
													style={{ 
														height: `${h1}%`,
														animationDelay: `${i * 0.1}s`
													}}
												></div>
												<div 
													className="w-full bg-neutral-200 rounded-t animate-pulse" 
													style={{ 
														height: `${h2}%`,
														animationDelay: `${i * 0.1 + 0.05}s`
													}}
												></div>
												<div 
													className="w-full bg-neutral-200 rounded-t animate-pulse" 
													style={{ 
														height: `${h3}%`,
														animationDelay: `${i * 0.1 + 0.1}s`
													}}
												></div>
											</div>
											<div className="w-8 h-2 bg-neutral-200 rounded animate-pulse mt-1"></div>
										</div>
									);
								})}
							</div>
						</div>
					) : data?.chart && transformChartData(data.chart).length > 0 ? (
						<ResponsiveContainer width="100%" height={240}>
							<BarChart
								data={transformChartData(data.chart)}
								margin={{
									top: 5,
									right: 30,
									left: 20,
									bottom: 5,
								}}
							>
								<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
								<XAxis
									dataKey="label"
									tick={{ fontSize: 10, fill: "#6b7280" }}
								/>
								<YAxis
									tick={{ fontSize: 10, fill: "#6b7280" }}
									tickFormatter={(value: number): string => {
										const formatted = formatNumberWithCurrency(value, data?.currency, {
											decimalScaleValue: 0,
											stringExport: true,
											isReportValue: true,
										});
										return typeof formatted === "string" ? formatted : String(formatted);
									}}
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: "#ffffff",
										border: "1px solid #e5e7eb",
										borderRadius: "6px",
										padding: "8px",
									}}
									formatter={(value: number, name: string) => {
										return [
											formatNumberWithCurrency(value, data?.currency, {
												decimalScaleValue: 0,
												stringExport: true,
												isReportValue: true,
											}),
											name.charAt(0).toUpperCase() + name.slice(1),
										];
									}}
								/>
								<Legend
									wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
									iconType="rect"
								/>
								<Bar dataKey="current" name="Current" fill="#2196F3" radius={[4, 4, 0, 0]} />
								<Bar dataKey="previous" name="Previous" fill="#C4B5FD" radius={[4, 4, 0, 0]} />
								<Bar dataKey="forecast" name="Forecast" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
							</BarChart>
						</ResponsiveContainer>
					) : null}
				</div>
			</div>
		);
	};

	const BillingCard = ({
		period
	}: {
		period: "mtd" | "ytd";
	}) => {
		const isLoading = revenueQuery.isLoading || revenueQuery.isFetching;
		const billing = revenueQuery.data?.billing?.[period];
		const backlog = revenueQuery.data?.backlog?.[period];
		const forecastData = revenueQuery.data?.forecast?.[period];

		return (
			<div className="flex flex-col justify-between gap-2 p-2 bg-white border border-neutral-200 rounded-lg">
				{/* Billing Section */}
				<div className="flex justify-between items-center gap-1.5 border-b border-neutral-100 pb-1.5">
					<div>
						<div className="flex flex-row gap-1.5 justify-start items-center mb-1">
							<div className="flex justify-center items-center bg-highlightColor-purpleLight px-1 rounded-full w-6 h-6">
								<Icon
									icon="solar:diagram-up-outline"
									width={14}
									height={14}
									className="text-highlightColor-purple"
								/>
							</div>
							<div className="text-neutral-700 text-[10px] font-semibold">Billing {period.toUpperCase()}</div>
						</div>
						<div className="flex flex-row items-center justify-start gap-2">
							<div className="inline-flex flex-row items-center justify-start gap-1">
								<div className="justify-start text-neutral-900 text-[9px] font-normal leading-none capitalize">
									This {period === "mtd" ? "Month" : "Year"}:
								</div>
								{isLoading ? (
									<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
										<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
										<span className="bg-neutral-200 text-transparent rounded w-4 h-3"></span>
									</div>
								) : (
									<div className="flex flex-row items-center justify-start gap-0.5 text-neutral-900 text-xs font-semibold">
										{formatNumberWithCurrency(billing?.current?.total, billing?.currency, {
											decimalScaleValue: 0,
											stringExport: true,
											isReportValue: true
										})}
										<span className="text-[9px] font-normal text-neutral-600">
											({formatNumberWithCurrency(billing?.current?.count, undefined, {
												decimalScaleValue: 0,
												stringExport: true,
												isReportValue: true
											})})
										</span>
									</div>
								)}
							</div>
							<div className="inline-flex flex-row items-center justify-start gap-1">
								<div className="justify-start text-neutral-900 text-[9px] font-normal leading-none capitalize">
									Previous {period === "mtd" ? "Month" : "Year"}:
								</div>
								{isLoading ? (
									<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
										<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
										<span className="bg-neutral-200 text-transparent rounded w-4 h-3"></span>
									</div>
								) : (
									<div className="flex flex-row items-center justify-start gap-0.5 text-neutral-900 text-xs font-semibold">
										{formatNumberWithCurrency(billing?.previous?.total, billing?.currency, {
											decimalScaleValue: 0,
											stringExport: true,
											isReportValue: true
										})}
										<span className="text-[9px] font-normal text-neutral-600">
											({formatNumberWithCurrency(billing?.previous?.count, undefined, {
												decimalScaleValue: 0,
												stringExport: true,
												isReportValue: true
											})})
										</span>
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Change percentage */}
					{!isLoading && billing?.change && (
						<div className="inline-flex flex-col justify-center items-center gap-0.5">
							<div className="inline-flex justify-start items-center gap-0.5">
								<span className="text-neutral-700 text-[9px] font-normal leading-none">Amount:</span>
								<span className="text-neutral-900 text-[9px] font-normal leading-none">
									{formatNumberWithCurrency(billing.change.amount_percentage, undefined, {
										decimalScaleValue: 0,
										stringExport: true,
										otherSign: "%",
										isReportValue: true,
									})}
									{billing.change.amount_increase ? (
										<Icon icon="solar:course-up-bold" className="text-success-500 text-[9px] ml-0.5" width={9} />
									) : (
										<Icon icon="solar:course-down-bold" className="text-danger-500 text-[9px] ml-0.5" width={9} />
									)}
								</span>
							</div>
							<div className="inline-flex justify-start items-center gap-0.5">
								<span className="text-neutral-700 text-[9px] font-normal leading-none">Count:</span>
								<span className="text-neutral-900 text-[9px] font-normal leading-none">
									{formatNumberWithCurrency(billing.change.count_percentage, undefined, {
										decimalScaleValue: 0,
										stringExport: true,
										otherSign: "%",
										isReportValue: true,
									})}
									{billing.change.count_increase ? (
										<Icon icon="solar:course-up-bold" className="text-success-500 text-[9px] ml-0.5" width={9} />
									) : (
										<Icon icon="solar:course-down-bold" className="text-danger-500 text-[9px] ml-0.5" width={9} />
									)}
								</span>
							</div>
						</div>
					)}
				</div>

				{/* Backlog Section */}
				<div className="flex justify-between items-center gap-1.5 border-b border-neutral-100">
					<div>
						<div className="flex flex-row gap-1.5 justify-start items-center mb-1">
							<div className="flex justify-center items-center bg-highlightColor-redLight px-1 rounded-full w-6 h-6">
								<Icon
									icon="solar:diagram-up-outline"
									width={14}
									height={14}
									className="text-highlightColor-red"
								/>
							</div>
							<div className="flex justify-between items-center gap-5">
								<div className="text-neutral-700 text-[10px] font-semibold">Backlog {period.toUpperCase()}</div>

								{isLoading ? (
									<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
										<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
										<span className="bg-neutral-200 text-transparent rounded w-4 h-3"></span>
									</div>
								) : (
									<div className="flex flex-row items-center justify-start gap-0.5 text-neutral-900 text-xs font-semibold">
										{formatNumberWithCurrency(backlog?.current?.total, backlog?.currency, {
											decimalScaleValue: 0,
											stringExport: true,
											isReportValue: true
										})}
										<span className="text-[9px] font-normal text-neutral-600">
											({formatNumberWithCurrency(backlog?.current?.count, undefined, {
												decimalScaleValue: 0,
												stringExport: true,
												isReportValue: true
											})})
										</span>
									</div>
								)}
							</div>
						</div>

					</div>

				</div>

				{/* Forecast Section */}
				<div className="flex flex-row items-center justify-start gap-2 mt-2">
					<div className="inline-flex flex-row items-center justify-start gap-1">
						<div className="justify-start text-neutral-900 text-[9px] font-normal leading-none">
							Accounts Forecast:
						</div>
						{isLoading ? (
							<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
								<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
							</div>
						) : (
							<div className="flex flex-row items-center justify-start gap-0.5 text-neutral-900 text-xs font-semibold">
								{formatNumberWithCurrency(forecastData?.account_forecast?.forecast, forecastData?.currency || billing?.currency, {
									decimalScaleValue: 0,
									stringExport: true,
									isReportValue: true
								})}
							</div>
						)}
					</div>

					<div className="inline-flex flex-row items-center justify-start gap-1">
						<div className="justify-start text-neutral-900 text-[9px] font-normal leading-none">
							Difference:
						</div>
						{isLoading ? (
							<div className="flex flex-row items-center justify-start gap-1 text-neutral-900 text-xs font-semibold animate-pulse">
								<span className="bg-neutral-200 text-transparent rounded w-16 h-4"></span>
							</div>
						) : (
							<div className={`flex flex-row items-center justify-start gap-0.5 text-xs font-semibold ${(forecastData?.account_forecast?.difference ?? 0) > 0 ? "text-success-500" : "text-danger-500"}`}>
								{formatNumberWithCurrency(forecastData?.account_forecast?.difference, forecastData?.currency || billing?.currency, {
									decimalScaleValue: 0,
									stringExport: true,
									isReportValue: true
								})}
							</div>
						)}
					</div>
				</div>

				{/* Chart Section */}
				<div className="mt-3 pt-2 border-t border-neutral-100">
					{isLoading ? (
						<div className="w-full h-[240px] flex flex-col gap-2">
							{/* Legend skeleton */}
							<div className="flex items-center justify-center gap-4 pb-2">
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 bg-neutral-200 rounded animate-pulse"></div>
									<div className="w-12 h-3 bg-neutral-200 rounded animate-pulse"></div>
								</div>
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 bg-neutral-200 rounded animate-pulse"></div>
									<div className="w-12 h-3 bg-neutral-200 rounded animate-pulse"></div>
								</div>
								<div className="flex items-center gap-1.5">
									<div className="w-3 h-3 bg-neutral-200 rounded animate-pulse"></div>
									<div className="w-12 h-3 bg-neutral-200 rounded animate-pulse"></div>
								</div>
							</div>
							{/* Chart area skeleton */}
							<div className="flex-1 flex items-end justify-between gap-2 px-4 pb-2">
								{Array.from({ length: 8 }).map((_, i) => {
									const heights = [
										[70, 60, 50],
										[85, 75, 65],
										[60, 50, 40],
										[90, 80, 70],
										[55, 45, 35],
										[75, 65, 55],
										[65, 55, 45],
										[80, 70, 60],
									];
									const [h1, h2, h3] = heights[i % heights.length];
									return (
										<div key={i} className="flex-1 flex flex-col items-center gap-1">
											<div className="w-full flex flex-col items-center gap-1 justify-end" style={{ height: '160px' }}>
												<div 
													className="w-full bg-neutral-200 rounded-t animate-pulse" 
													style={{ 
														height: `${h1}%`,
														animationDelay: `${i * 0.1}s`
													}}
												></div>
												<div 
													className="w-full bg-neutral-200 rounded-t animate-pulse" 
													style={{ 
														height: `${h2}%`,
														animationDelay: `${i * 0.1 + 0.05}s`
													}}
												></div>
												<div 
													className="w-full bg-neutral-200 rounded-t animate-pulse" 
													style={{ 
														height: `${h3}%`,
														animationDelay: `${i * 0.1 + 0.1}s`
													}}
												></div>
											</div>
											<div className="w-8 h-2 bg-neutral-200 rounded animate-pulse mt-1"></div>
										</div>
									);
								})}
							</div>
						</div>
					) : billing?.chart && transformChartData(billing.chart).length > 0 ? (
						<ResponsiveContainer width="100%" height={240}>
							<BarChart
								data={transformChartData(billing.chart)}
								margin={{
									top: 5,
									right: 30,
									left: 20,
									bottom: 5,
								}}
							>
								<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
								<XAxis
									dataKey="label"
									tick={{ fontSize: 10, fill: "#6b7280" }}
								/>
								<YAxis
									tick={{ fontSize: 10, fill: "#6b7280" }}
									tickFormatter={(value: number): string => {
										const formatted = formatNumberWithCurrency(value, billing?.currency, {
											decimalScaleValue: 0,
											stringExport: true,
											isReportValue: true,
										});
										return typeof formatted === "string" ? formatted : String(formatted);
									}}
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: "#ffffff",
										border: "1px solid #e5e7eb",
										borderRadius: "6px",
										padding: "8px",
									}}
									formatter={(value: number, name: string) => {
										return [
											formatNumberWithCurrency(value, billing?.currency, {
												decimalScaleValue: 0,
												stringExport: true,
												isReportValue: true,
											}),
											name.charAt(0).toUpperCase() + name.slice(1),
										];
									}}
								/>
								<Legend
									wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }}
									iconType="rect"
								/>
								<Bar dataKey="current" name="Current" fill="#2196F3" radius={[4, 4, 0, 0]} />
								<Bar dataKey="previous" name="Previous" fill="#C4B5FD" radius={[4, 4, 0, 0]} />
								<Bar dataKey="forecast" name="Forecast" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
							</BarChart>
						</ResponsiveContainer>
					) : null}
				</div>
			</div>
		);
	};

	return (
		<div className={`p-2 space-y-1.5 ${isFullscreen ? "min-h-[calc(100vh-200px)]" : ""}`}>
			{/* Header Section */}
			<div className="flex items-center justify-between mb-2 pb-1.5 border-b border-neutral-200">
				<div className="flex items-center gap-2">
					<div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-primary-50 to-primary-100">
						<Icon
							icon="solar:chart-2-bold-duotone"
							width={14}
							height={14}
							className="text-primary-600"
						/>
					</div>
					<div className="flex flex-col">
						<h5 className="font-semibold text-base text-black leading-tight">Revenue</h5>
						<span className="text-[10px] text-neutral-500 font-normal leading-tight">Revenue performance overview</span>
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

			{canViewDeveloperRevenueCards && (
				<>
					{/* Booking Row - MTD and YTD */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
						<BookingCard
							title="Booking MTD"
							period="mtd"
							iconColor="text-highlightColor-blue"
							iconBgColor="bg-highlightColor-blueLight"
						/>
						<BookingCard
							title="Booking YTD"
							period="ytd"
							iconColor="text-highlightColor-blue"
							iconBgColor="bg-highlightColor-blueLight"
						/>
					</div>

					{/* Billing Row - MTD and YTD */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
						<BillingCard
							period="mtd"
						/>
						<BillingCard
							period="ytd"
						/>
					</div>
				</>
			)}

			<RevenueComparisonSection globalUserId={selectedUserId} date_from={date_from} date_to={date_to} />
		</div>
	);
}
