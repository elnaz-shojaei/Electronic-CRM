import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { getToken } from "../../../../config/config";
import DashboardAPI from "../../../../config/sub-apis/dashboard.api";
import { Icon } from "@iconify-icon/react/dist/iconify.mjs";
import LoadingDots from "../../../../components/LoadingDots";
import { formatNumberWithCurrency, formatTime } from "../../../../helper/fieldsHelper";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { QuoteChances } from "../../../../components/Options/SelectOptions";

interface Forecast {
  id: string;
  year: string;
  currency: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

interface Quote {
  id: string;
  quote_number2: string;
  subject: string;
  quote_date: string;
  total_sales: string;
  margin: string;
  currency: string;
  quote_stage: string;
  quote_chance: string;
  account: {
    id: string;
    account_name: string;
    image_data: string | null;
    forecasts: Forecast[];
  };
  product: {
    id: string;
    product_name: string;
    manufacturer: {
      id: string;
      name: string;
    } | null;
  } | null;
  deal: {
    id: string;
    deal_name: string;
    deal_stage: string;
  } | null;
}

interface QuoteKPIData {
  data: {
    statistics: {
      total_count: number;
      total_sales_sum: number;
      high_chance_count: number;
      high_chance_sales_sum: number;
      pie_chart_data: Array<{
        quote_stage: string;
        count: number;
        total_sales_sum: number;
      }>;
      currency: string;
      period: {
        start_date: string | null;
        end_date: string | null;
      };
    };
    quotes: Quote[];
  };
  page: number;
  per_page: number;
  total_records: number;
  has_more_pages: boolean;
}

// Color mapping for quote stages
const QUOTE_STAGE_COLORS: Record<string, string> = {
  "Draft": "#9CA3AF",                    // Gray - early stage
  "Open": "#2196F3",                     // Blue - active/open
  "No Feedback": "#FF9A66",               // Orange - needs attention
  "Negotiation Price": "#805DCA",        // Purple - negotiation phase
  "Negotiation Conditions": "#E478CF",   // Pink/Magenta - negotiation phase
  "Lost": "#E44F5D",                     // Red - negative outcome
  "Won": "#529553",                      // Green - positive outcome
};

// Fallback color for unknown stages
const DEFAULT_COLOR = "#545454";

// Color mapping for quote chances
const QUOTE_CHANCE_COLORS: Record<string, string> = {
  "Unknown": "#9CA3AF",                    // Gray - neutral/unknown
  "Low": "#E44F5D",                        // Red - low probability
  "High": "#529553",                       // Green - high probability
};

interface SalesPersonQuoteKPIsProps {
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  isActive?: boolean;
}

export default function SalesPersonQuoteKPIs({ isFullscreen = false, onToggleFullscreen, isActive = true }: SalesPersonQuoteKPIsProps) {
  const dashboardApi = new DashboardAPI();
  const userData = getToken("userData");
  const [selectedType, setSelectedType] = useState<"all" | "my_own" | "account_owner">("all");
  const [selectedQuoteStage, setSelectedQuoteStage] = useState<string>("all");
  const [selectedQuoteChance, setSelectedQuoteChance] = useState<string>("all");
  const [quotesData, setQuotesData] = useState<Quote[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isQuotesLoading, setIsQuotesLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  const perPage = isFullscreen ? 20 : 10;
  
  const { data: quoteData, isLoading, isFetching } = useQuery<QuoteKPIData>({
    queryKey: ["sales-person-quotes", userData?.id, selectedType],
    queryFn: async () => {
      const result = await dashboardApi.kpisQuotes("personal", "quotes", userData?.id, selectedType);
      return result.data;
    },
    enabled: !!userData?.id && isActive,
  });

  const fetchQuotes = useCallback(async (pageNum: number, append: boolean = false) => {
    if (isLoadingRef.current || !userData?.id || !isActive) return;

    isLoadingRef.current = true;
    setIsQuotesLoading(true);
    try {
      const result = await dashboardApi.kpisQuotes("personal", "quotes", userData?.id, selectedType, undefined, undefined, pageNum, perPage, selectedQuoteStage, selectedQuoteChance);
      const response = result.data as QuoteKPIData;

      if (response && response.data) {
        const newQuotes = response.data.quotes || [];
        const hasMorePages = response.has_more_pages ?? false;

        if (append) {
          setQuotesData((prev) => [...prev, ...newQuotes]);
        } else {
          setQuotesData(newQuotes);
        }

        setHasMore(hasMorePages);
        setCurrentPage(pageNum);
        if (response.total_records !== undefined) {
          setTotalRecords(response.total_records);
        }
      }
    } catch (error) {
      console.error("Error fetching quotes:", error);
      setHasMore(false);
    } finally {
      setIsQuotesLoading(false);
      isLoadingRef.current = false;
    }
  }, [userData?.id, selectedType, selectedQuoteStage, selectedQuoteChance, dashboardApi, perPage]);

  // Reset and fetch first page when type or filters change or on initial load
  useEffect(() => {
    setCurrentPage(1);
    setHasMore(true);
    setQuotesData([]);
    if (userData?.id && isActive) {
      fetchQuotes(1, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, selectedQuoteStage, selectedQuoteChance, userData?.id, isActive]);

  useEffect(() => {
    if(quotesData.length > 0 && quotesData.length < perPage) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchQuotes(nextPage, true);
    }
  }, [perPage]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isQuotesLoading || !hasMore) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Load more when within 100px of bottom
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchQuotes(nextPage, true);
    }
  }, [currentPage, isQuotesLoading, hasMore, fetchQuotes]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  const isLoadingState = isLoading || isFetching;
  const isTableLoadingState = isQuotesLoading;

  const StatCard = ({
    title,
    value,
    icon,
    iconColor,
    iconBgColor,
    isLoading: loading,
    isCurrency = false
  }: {
    title: string;
    value: number | undefined;
    icon: string;
    iconColor: string;
    iconBgColor: string;
    isLoading: boolean;
    isCurrency?: boolean;
  }) => {
    return (
      <div className="flex flex-row items-center justify-between gap-2 p-1.5 bg-white border border-neutral-200 rounded-lg">
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
              {isCurrency && value !== undefined
                ? formatNumberWithCurrency(value, quoteData?.data?.statistics?.currency, {
                  decimalScaleValue: 0,
                  stringExport: true,
                  isReportValue: true
                })
                : value?.toLocaleString() || 0}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-2 space-y-1.5">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-primary-50 to-primary-100">
            <Icon
              icon="solar:document-check-bold-duotone"
              width={14}
              height={14}
              className="text-primary-600"
            />
          </div>
          <div className="flex flex-col">
            <h5 className="font-semibold text-base text-black leading-tight">Quote Overview</h5>
            <span className="text-[10px] text-neutral-500 font-normal leading-tight">Quote metrics and analytics</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Type Filter Toggle */}
          <div className="flex items-center gap-1 bg-neutral-100 rounded p-0.5">
            <button
              onClick={() => setSelectedType("all")}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${selectedType === "all"
                ? "bg-white text-primary-600 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
                }`}
            >
              Both
            </button>
            <button
              onClick={() => setSelectedType("my_own")}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${selectedType === "my_own"
                ? "bg-white text-primary-600 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
                }`}
            >
              Based on My Owned Quotes
            </button>
            <button
              onClick={() => setSelectedType("account_owner")}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${selectedType === "account_owner"
                ? "bg-white text-primary-600 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
                }`}
            >
              Based on My Owned Accounts
            </button>
          </div>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
        <StatCard
          title="Total"
          value={quoteData?.data?.statistics?.total_count}
          icon="solar:document-check-bold-duotone"
          iconColor="text-primary-600"
          iconBgColor="bg-primary-50"
          isLoading={isLoadingState}
        />
        <StatCard
          title="Total Sales Sum"
          value={quoteData?.data?.statistics?.total_sales_sum}
          icon="solar:dollar-minimalistic-bold-duotone"
          iconColor="text-highlightColor-green"
          iconBgColor="bg-highlightColor-greenLight"
          isLoading={isLoadingState}
          isCurrency={true}
        />
        <StatCard
          title="High Chance Count"
          value={quoteData?.data?.statistics?.high_chance_count}
          icon="solar:target-bold-duotone"
          iconColor="text-highlightColor-blue"
          iconBgColor="bg-highlightColor-blueLight"
          isLoading={isLoadingState}
        />
        <StatCard
          title="High Chance Sales Sum"
          value={quoteData?.data?.statistics?.high_chance_sales_sum}
          icon="solar:chart-2-bold-duotone"
          iconColor="text-highlightColor-yellow"
          iconBgColor="bg-highlightColor-yellowLight"
          isLoading={isLoadingState}
          isCurrency={true}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
        {/* pie chart */}
        <div className="flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg">
          <div className="text-neutral-900 text-sm font-semibold mb-1">Stages Distribution</div>
          {isLoadingState ? (
            <div className="flex items-center justify-center py-8">
              <LoadingDots size="sm" />
            </div>
          ) : (() => {
            // Check if there's meaningful data (at least one count > 0)
            const hasData = quoteData?.data?.statistics?.pie_chart_data &&
              quoteData?.data?.statistics?.pie_chart_data.length > 0 &&
              quoteData?.data?.statistics?.pie_chart_data.some(item => item.count > 0);

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
                    <p className="text-[9px] text-neutral-500">No quotes in any stage</p>
                  </div>
                </div>
              );
            }

            return (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={isFullscreen ? 250 : 120}>
                  <PieChart>
                    <Pie
                      data={quoteData?.data?.statistics?.pie_chart_data.map(item => ({
                        name: item.quote_stage,
                        value: item.count
                      }))}
                      cx="50%"
                      cy="50%"
                      outerRadius={isFullscreen ? 100 : 50}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {quoteData?.data?.statistics?.pie_chart_data.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={QUOTE_STAGE_COLORS[entry.quote_stage] || DEFAULT_COLOR}
                          style={{ cursor: "pointer" }}
                          onClick={() => {
                            setSelectedQuoteStage(selectedQuoteStage === entry.quote_stage ? "all" : entry.quote_stage);
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
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
                <div className="flex flex-wrap gap-2 justify-center mt-1">
                  {quoteData?.data?.statistics?.pie_chart_data.map((item, index) => (
                    <div 
                      key={item.quote_stage} 
                      className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        setSelectedQuoteStage(selectedQuoteStage === item.quote_stage ? "all" : item.quote_stage);
                      }}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${selectedQuoteStage === item.quote_stage ? "ring-2 ring-primary-600 ring-offset-1" : ""}`}
                        style={{ backgroundColor: QUOTE_STAGE_COLORS[item.quote_stage] || DEFAULT_COLOR }}
                      />
                      <span className="text-[9px] text-neutral-600">{item.quote_stage}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Quotes list */}
        <div className="md:col-span-3 flex flex-col gap-1.5 p-2 bg-white border border-neutral-200 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Icon
                icon="solar:document-check-bold-duotone"
                width={14}
                height={14}
                className="text-neutral-600"
              />
              <div className="text-neutral-900 text-sm font-semibold">All Ongoing Quotes</div>
              {!isTableLoadingState && quotesData && (
                <span className="text-[9px] text-neutral-500 font-normal">
                  ({totalRecords} {totalRecords === 1 ? 'quote' : 'quotes'})
                </span>
              )}
            </div>
            {/* Quote Chance Filter */}
            <div className="flex flex-wrap gap-2 justify-center">
              {QuoteChances.map((chance) => (
                <div 
                  key={chance.value} 
                  className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    setSelectedQuoteChance(selectedQuoteChance === chance.value ? "all" : chance.value);
                  }}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${selectedQuoteChance === chance.value ? "ring-2 ring-primary-600 ring-offset-1" : ""}`}
                    style={{ backgroundColor: QUOTE_CHANCE_COLORS[chance.value] || DEFAULT_COLOR }}
                  />
                  <span className="text-[9px] text-neutral-600">{chance.label}</span>
                </div>
              ))}
            </div>
          </div>
          {(isLoadingState || isQuotesLoading) && quotesData.length === 0 ? (
            <div className={`${isFullscreen ? "min-h-[calc(100vh-350px)]" : "min-h-52"} flex items-center justify-center py-4`}>
              <LoadingDots size="sm" />
            </div>
          ) : quotesData && quotesData.length > 0 ? (
            <div
              ref={scrollContainerRef}
              className={`overflow-y-auto space-y-1 ${isFullscreen ? "min-h-[calc(100vh-350px)] max-h-[calc(100vh-350px)]" : "min-h-52 max-h-52"}`}
            >
              {quotesData.map((quote) => (
                <div
                  key={quote.id}
                  className="flex flex-row items-center gap-2 flex-wrap p-1.5 bg-white rounded border border-neutral-200 hover:bg-neutral-50 transition-colors"
                  style={quote.quote_chance === "High" ? { borderLeft: "5px solid #529553" } : undefined}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: QUOTE_STAGE_COLORS[quote.quote_stage] || DEFAULT_COLOR }}
                  />
                  <NavLink
                    className="text-primary hover:underline"
                    to={`/quote/preview/${quote.id}`}
                  >
                    <span className="text-xs text-neutral-900 font-medium truncate">
                      {quote.quote_number2}
                    </span>
                  </NavLink>

                  {quote.quote_date && (
                    <div className="flex items-center gap-1">
                      <Icon
                        icon="solar:calendar-bold-duotone"
                        width={9}
                        height={9}
                        className="text-neutral-400"
                      />
                      <span className="text-[9px] text-neutral-500 font-normal">
                        {formatTime(quote.quote_date, "quote", { withClock: false })}
                      </span>
                    </div>
                  )}

                  {quote.product?.product_name && (
                    <div className="flex flex-col gap-0 min-w-40">
                      <div className="flex items-center gap-1">
                        <Icon
                          icon="solar:box-bold-duotone"
                          width={9}
                          height={9}
                          className="text-neutral-400 flex-shrink-0"
                        />
                        <NavLink
                          className="text-primary hover:underline"
                          to={`/product/preview/${quote.product.id}`}
                        >
                          <span className="text-[9px] text-neutral-500 font-normal truncate max-w-[100px]">
                            {quote.product.product_name}
                          </span>
                        </NavLink>
                      </div>
                      {quote.product.manufacturer?.name && (
                        <div className="text-[8px] text-neutral-400 font-normal leading-tight -mt-0.5">
                          Mfr: {quote.product.manufacturer.name}
                        </div>
                      )}
                    </div>
                  )}

                  {quote.total_sales && parseFloat(quote.total_sales) > 0 ? (
                    <span className="text-[9px] text-neutral-700 font-semibold flex-shrink-0 min-w-20">
                      {formatNumberWithCurrency(parseFloat(quote.total_sales), quote.currency, {
                        decimalScaleValue: 0,
                        stringExport: true,
                        isReportValue: true
                      })}
                    </span>
                  ) : (
                    <span className="text-[9px] text-neutral-500 font-normal flex-shrink-0 min-w-20">
                      -
                    </span>
                  )}

                  {quote.margin && parseFloat(quote.margin) > 0 ? (
                    <div className="flex items-center gap-1 min-w-20">
                      <Icon
                        icon="solar:chart-2-bold-duotone"
                        width={9}
                        height={9}
                        className="text-neutral-400"
                      />
                      <span className="text-[9px] text-neutral-500 font-normal">
                        {parseFloat(quote.margin).toFixed(1)}% margin
                      </span>
                    </div>
                  ):(
                    <span className="text-[9px] text-neutral-500 font-normal flex-shrink-0 min-w-20">
                      -
                    </span>
                  )}

                  {/* Account Name */}
                  {quote.account && (
                    <div className="flex items-center gap-1">
                      {/* {quote.account.image_data ? (
                        <img
                          src={quote.account.image_data}
                          alt={quote.account.account_name}
                          className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                        />
                      ) : ( */}
                        <Icon
                          icon="solar:user-bold-duotone"
                          width={9}
                          height={9}
                          className="text-neutral-400 flex-shrink-0"
                        />
                      {/* )} */}
                      <NavLink
                        className="text-primary hover:underline min-w-0"
                        to={`/account/preview/${quote.account.id}`}
                      >
                        <span className="text-[9px] text-neutral-500 font-normal truncate max-w-[100px] block">
                          {quote.account.account_name}
                        </span>
                      </NavLink>
                    </div>
                  )}
                </div>
              ))}
              {isQuotesLoading && (
                <div className="flex items-center justify-center py-2">
                  <LoadingDots size="sm" />
                </div>
              )}
              {!hasMore && quotesData.length > 0 && (
                <div className="text-center py-2 text-[9px] text-neutral-400">
                  No more quotes to load
                </div>
              )}
            </div>
          ) : (
            <div className="min-h-52 text-center py-4 text-xs text-neutral-500">
              No quotes found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
