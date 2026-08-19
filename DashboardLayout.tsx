import React from "react"; 
import Swal from "sweetalert2";
import { PropsWithChildren, Suspense, useEffect, useState, lazy } from "react";
import { useDispatch, useSelector } from "react-redux";
import App from "../../App";
import { IRootState } from "../../store";
import { toggleSidebar } from "../../store/themeConfigSlice";
import Footer from "./Footer";
import Header from "./Header";
import Setting from "./Setting";
import Sidebar from "./Sidebar";
import Portals from "../../components/Portals";
import LoadingSpinner from "../LoadingSpinner";
import { createSwalToast } from "../../helper/swalHelpers";
import { useNavigate } from "react-router-dom";
import { getToken } from "../../config/config";
import {useQueryClient } from "@tanstack/react-query";
import GlobalAPI from "../../config/sub-apis/globalApi";
import SnoozeModal from "./components/SnoozeModal";
import CallingModal from "./components/CallingModal";
import LogRecentCall from "./components/LogRecentCall";
import Cookies from "js-cookie";
const SupportChatWidget = lazy(() => import("../SupportChatWidget/ChatWidget"));
import Echo from "laravel-echo";
import { isDesktopNotificationEnabled } from "../../pages/Setting/NotificationSettings";
import Pusher from "pusher-js";
import { usePushSubscription } from "./hook/usePushSubscription";


declare global {
    interface Window {
        Pusher: typeof Pusher;
        Echo: Echo<'pusher' | 'reverb'>;
    }
}

interface CallingModalProps {
    id: string | null;
    data: any | null;
}

interface LogCallModalProps {
    id: string | null;
    data: any | null;
}

const isSupportChatEnabled = (import.meta as any).env.VITE_ENABLING_SUPPORT_CHAT === "true";

const DefaultLayout = ({ children }: PropsWithChildren) => {
    const navigate = useNavigate();
    const userData = getToken("userData");
    const themeConfig = useSelector((state: IRootState) => state.themeConfig);
    const dispatch = useDispatch();
    const GlobalApi = new GlobalAPI();
    const [modalOpen, setModalOpen] = useState(false);
    const [showLoader, setShowLoader] = useState(true);
    const [showTopButton, setShowTopButton] = useState(false);
    const [currentTaskId, setCurrentTaskId] = useState();

    const [callingModals, setCallingModals] = useState<CallingModalProps[]>([]);
    const [logCallModals, setLogCallModals] = useState<LogCallModalProps[]>([]);


    const queryClient = useQueryClient();

    usePushSubscription(!!userData?.id);

    const goToTop = () => {
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    };

    const onScrollHandler = () => {
        if (document.body.scrollTop > 50 || document.documentElement.scrollTop > 50) {
            setShowTopButton(true);
        } else {
            setShowTopButton(false);
        }
    };


    useEffect(() => {
        window.addEventListener("scroll", onScrollHandler);
        const screenLoader = document.getElementsByClassName("screen_loader");
        if (screenLoader?.length) {
            screenLoader[0].classList.add("animate__fadeOut");
            setTimeout(() => {
                setShowLoader(false);
            }, 200);
        }

        return () => {
            window.removeEventListener("onscroll", onScrollHandler);
        };
    }, []);

    useEffect(() => {
        if (themeConfig.menu === "horizontal" && themeConfig.sidebar) {
            dispatch(toggleSidebar());
        }
    }, [themeConfig.menu, themeConfig.sidebar, dispatch]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024 && themeConfig.sidebar) {
                dispatch(toggleSidebar());
            }
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [themeConfig.sidebar, dispatch]);

    const handleOpenCallingModal = (data: any) => {
        if (document.hidden) return;
        if(!userData?.personal_settings?.receive_incoming_call_notification) return;
        const isOpen = callingModals.find(modal => modal.id === data?.agent?.id);
        if (!isOpen) {
            setCallingModals([...callingModals, { id: data.agent.id, data }]);
        }
    };
    const handleOpenLogCallModal = (data: any) => {
        if (document.hidden) return;
        if(!userData?.personal_settings?.receive_recent_call_notification) return;
        const isOpen = logCallModals.find(modal => modal.id === data.call.id);
        if (!isOpen) {
            setLogCallModals([...logCallModals, { id: data.call.id, data }]);
        }
    };

    useEffect(() => {
        const userId = userData?.id;
        const organizationId = userData?.organization_id;
        const channelName = `private-user.${organizationId}.${userId}`;
        const callChannelName = `call.${organizationId}.${userId}`;

        // Subscribe via Echo
        const echoChannel = window?.Echo?.private(channelName);
        const echoCallChannel = window?.Echo?.private(callChannelName);

        // Access the underlying Pusher channel object
        const pusherChannel = echoChannel?.subscription;
        const pusherCallChannel = echoCallChannel?.subscription;

        pusherCallChannel?.bind_global((eventName, data) => {
            switch (eventName) {
                case "call.incoming":
                    handleOpenCallingModal(data);
                    break;
                case "call.ended":
                    handleOpenLogCallModal(data);
                    break;
                default:
                    break;
            }
        });

        // Use bind_global to catch all events
        pusherChannel?.bind_global((eventName, data) => {
            // console.log('Received event:', eventName, data);
            queryClient.invalidateQueries({ queryKey: ["socket_notification", "unread", userData?.organization_id] });
            switch (eventName) {
                case "TaskReminderNotification": {
                    // console.log("Received TaskReminderEvent:", eventName, data);
                    const payload = typeof data === 'string' ? JSON.parse(data) : data;
                    const title = payload?.title ?? 'Notification';
                    const description = payload?.description ?? '';

                    // Show Windows system notification for task reminders (only if enabled and permission granted)
                    if (isDesktopNotificationEnabled() && 'Notification' in window && Notification.permission === 'granted') {
                        new Notification(title, {
                            body: description,
                            icon: '/favicon.ico',
                            tag: payload?.data?.type ?? 'task-reminder',
                        });
                    }

                    createSwalToast(title, "info", {
                        position: "bottom-end",
                        html: `
                                <p class="text-gray-600 text-sm leading-relaxed mb-6">${description}</p>
                                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                                    <button id="view-details-btn" type="button" class="bg-[#C8D9EF] hover:bg-[#97B8E2] text-[#213F6B] font-medium py-2.5 px-4 rounded-md transition-colors duration-200">View Details</button>
                                    <button id="custom-snooze-btn" type="button" class="bg-[#C8D9EF] hover:bg-[#97B8E2] text-[#213F6B] font-medium py-2.5 px-4 rounded-md transition-colors duration-200">Snooze</button>
                                </div>
                            `,
                        // showConfirmButton: true,
                        // confirmButtonText: "View Details",
                        // cancelButtonText: '<button id="custom-snooze-btn" type="button" class="text-[#213f6b] text-md te rounded-md !w-fit px-3 py-2">Snooze</button>',
                        // showCancelButton: true,
                        didOpen: () => {
                            document.getElementById("custom-snooze-btn")?.addEventListener("click", () => {
                                setModalOpen(true);
                                setCurrentTaskId(payload?.data?.task_id);
                                Swal.close();
                            });
                            document.getElementById("view-details-btn")?.addEventListener("click", () => {
                                navigate(`/${payload?.module_name}/preview/${payload?.module_id}`);
                            });
                        },
                    });
                    break;
                }
                case "RfqInReviewNotification":
                    try {
                        // Parse the data string if it's a JSON string
                        const payload = typeof data === 'string' ? JSON.parse(data) : data;
                        const title = payload?.title ?? 'RFQs In Review';
                        const description = payload?.message ?? payload?.description ?? '';
                        const pushNotification = payload?.push_notification ?? false;

                        // Show Windows system notification (only if enabled and permission granted)
                        if (pushNotification && isDesktopNotificationEnabled() && 'Notification' in window && Notification.permission === 'granted') {
                            new Notification(title, {
                                body: description,
                                icon: '/favicon.ico',
                                tag: payload?.type ?? 'rfq-in-review',
                            });
                        }
                        createSwalToast(title, "info", {
                            position: "bottom-end",
                            html: `
                                <p class="text-gray-600 text-sm leading-relaxed mb-6">${description}</p>
                                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                                    <button id="view-rfqs-btn" type="button" class="bg-[#C8D9EF] hover:bg-[#97B8E2] text-[#213F6B] font-medium py-2.5 px-4 rounded-md transition-colors duration-200">View RFQs</button>
                                </div>
                            `,
                            didOpen: () => {
                                document.getElementById("view-rfqs-btn")?.addEventListener("click", () => {
                                    navigate("/rfq/dashboard?status=In Review");
                                    Swal.close();
                                });
                            },
                        });
                    } catch (error) {
                        console.error("Error parsing RfqInReviewNotification data:", error);
                        // Fallback notification if parsing fails
                        createSwalToast("RFQs in review notification received", "info", {
                            position: "bottom-end",
                        });
                    }
                    break;
                case "systemnotification":
                case "SystemNotification": {
                    const payload = typeof data === 'string' ? JSON.parse(data) : data;
                    const title = payload?.title ?? 'Notification';
                    const description = payload?.description ?? '';
                    const moduleName = payload?.module_name;
                    const moduleId = payload?.module_id;
                    // Support both nested and root level push_notification flag
                    const pushNotification = payload?.data?.push_notification ?? payload?.push_notification ?? false;

                    // Show Windows system notification (only if enabled and permission granted)
                    if (pushNotification && isDesktopNotificationEnabled() && 'Notification' in window && Notification.permission === 'granted') {
                        new Notification(title, {
                            body: description,
                            icon: '/favicon.ico',
                            tag: payload?.data?.type ?? payload?.type ?? 'system-notification',
                        });
                    }

                    const hasLink = moduleName && moduleId;
                    createSwalToast(title, "info", {
                        position: "bottom-end",
                        html: `
                            <p class="text-gray-600 text-sm leading-relaxed mb-6">${description}</p>
                            ${hasLink ? `
                                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                                    <button id="system-notif-view-btn" type="button" class="bg-[#C8D9EF] hover:bg-[#97B8E2] text-[#213F6B] font-medium py-2.5 px-4 rounded-md transition-colors duration-200">View Details</button>
                                </div>
                            ` : ''}
                        `,
                        didOpen: hasLink
                            ? () => {
                                document.getElementById("system-notif-view-btn")?.addEventListener("click", () => {
                                    navigate(`/${moduleName}/preview/${moduleId}`);
                                    Swal.close();
                                });
                            }
                            : undefined,
                    });
                    break;
                }
                case "NewFeedSubmittedNotification": {
                    const payload = typeof data === "string" ? JSON.parse(data) : data;
                    const title = payload?.title ?? "New feed";
                    const description = payload?.description ?? payload?.message ?? "";
                    const moduleId = payload?.module_id;
                    const pushNotification = payload?.data?.push_notification ?? payload?.push_notification ?? false;

                    if (pushNotification && isDesktopNotificationEnabled() && "Notification" in window && Notification.permission === "granted") {
                        const notification = new Notification(title, {
                            body: description,
                            icon: "/favicon.ico",
                            tag: payload?.data?.type ?? "feed-notification",

                        });

                        notification.onclick = () => {
                            window.open(`${import.meta.env.VITE_APP_URL}/feed/list?filter=all_feed&feedId=${moduleId}`, "_blank");
                        };
                    }

                    const hasLink = !!moduleId;
                    createSwalToast(title, "info", {
                        position: "bottom-end",
                        html: `
                            <p class="text-gray-600 text-sm leading-relaxed mb-6">${description}</p>
                            ${hasLink ? `
                                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                                    <button id="feed-notif-view-btn" type="button" class="bg-[#C8D9EF] hover:bg-[#97B8E2] text-[#213F6B] font-medium py-2.5 px-4 rounded-md transition-colors duration-200">View</button>
                                </div>
                            ` : ""}
                        `,
                        didOpen: hasLink
                            ? () => {
                                document.getElementById("feed-notif-view-btn")?.addEventListener("click", () => {
                                    navigate(`/feed/list?filter=all_feed&feedId=${moduleId}`);
                                    Swal.close();
                                });
                            }
                            : undefined,
                    });
                    break;
                }
                case "NewNotificationEvent":
                    // console.log("Received NewNotificationEvent:", eventName, data);
                    break;
                default:
                // console.warn('Unknown event type:', eventName, data);
            }
        });
        // Check if the TFA notification has been shown in the last 24 hours
        const tfaNotificationShown = Cookies.get("tfa_notification_shown");
        if (tfaNotificationShown === "true") return;

        if (userData?.two_factor_auth_is_active === false) {
            createSwalToast("Two-factor authentication is not enabled yet", "info", {
                position: "bottom-end",
                html: (
                    <p className="text-gray-600 text-sm leading-relaxed mb-6">
                        Two-factor authentication adds an additional layer of security to your account by requiring more than just a password to sign in.
                    </p>
                ),
                showConfirmButton: true,
                confirmButtonText: "Enable TFA authentication",
                customClass: {
                    confirmButton: "bg-[#C8D9EF] hover:bg-[#97B8E2] text-[#213F6B] font-medium py-2.5 px-4 rounded-md transition-colors duration-200",
                },
            }).then(async result => {
                if (result.isConfirmed) {
                    navigate("/setting/security?tab=1");
                }
            });

            // Set cookie to prevent showing this notification for 24 hours
            Cookies.set("tfa_notification_shown", "true", { expires: 1 });
        }
    }, [userData]);

    return (
        <>
        <App>
            {/* BEGIN MAIN CONTAINER */}
            <div className="relative">
                {/* sidebar menu overlay */}
                <div className={`${(!themeConfig.sidebar && "hidden") || ""}  fixed inset-0 bg-[black]/60 z-50 lg:hidden`} onClick={() => dispatch(toggleSidebar())}></div>
                {/* screen loader */}
                {showLoader && (
                    <div className="screen_loader fixed inset-0 bg-[#fafafa] dark:bg-[#060818] z-[60] grid place-content-center animate__animated">
                        {/* <svg width="64" height="64" viewBox="0 0 135 135" xmlns="http://www.w3.org/2000/svg" fill="#4361ee">
                            <path d="M67.447 58c5.523 0 10-4.477 10-10s-4.477-10-10-10-10 4.477-10 10 4.477 10 10 10zm9.448 9.447c0 5.523 4.477 10 10 10 5.522 0 10-4.477 10-10s-4.478-10-10-10c-5.523 0-10 4.477-10 10zm-9.448 9.448c-5.523 0-10 4.477-10 10 0 5.522 4.477 10 10 10s10-4.478 10-10c0-5.523-4.477-10-10-10zM58 67.447c0-5.523-4.477-10-10-10s-10 4.477-10 10 4.477 10 10 10 10-4.477 10-10z">
                                <animateTransform attributeName="transform" type="rotate" from="0 67 67" to="-360 67 67" dur="2.5s" repeatCount="indefinite" />
                            </path>
                            <path d="M28.19 40.31c6.627 0 12-5.374 12-12 0-6.628-5.373-12-12-12-6.628 0-12 5.372-12 12 0 6.626 5.372 12 12 12zm30.72-19.825c4.686 4.687 12.284 4.687 16.97 0 4.686-4.686 4.686-12.284 0-16.97-4.686-4.687-12.284-4.687-16.97 0-4.687 4.686-4.687 12.284 0 16.97zm35.74 7.705c0 6.627 5.37 12 12 12 6.626 0 12-5.373 12-12 0-6.628-5.374-12-12-12-6.63 0-12 5.372-12 12zm19.822 30.72c-4.686 4.686-4.686 12.284 0 16.97 4.687 4.686 12.285 4.686 16.97 0 4.687-4.686 4.687-12.284 0-16.97-4.685-4.687-12.283-4.687-16.97 0zm-7.704 35.74c-6.627 0-12 5.37-12 12 0 6.626 5.373 12 12 12s12-5.374 12-12c0-6.63-5.373-12-12-12zm-30.72 19.822c-4.686-4.686-12.284-4.686-16.97 0-4.686 4.687-4.686 12.285 0 16.97 4.686 4.687 12.284 4.687 16.97 0 4.687-4.685 4.687-12.283 0-16.97zm-35.74-7.704c0-6.627-5.372-12-12-12-6.626 0-12 5.373-12 12s5.374 12 12 12c6.628 0 12-5.373 12-12zm-19.823-30.72c4.687-4.686 4.687-12.284 0-16.97-4.686-4.686-12.284-4.686-16.97 0-4.687 4.686-4.687 12.284 0 16.97 4.686 4.687 12.284 4.687 16.97 0z">
                                <animateTransform attributeName="transform" type="rotate" from="0 67 67" to="360 67 67" dur="8s" repeatCount="indefinite" />
                            </path>
                        </svg> */}
                        {/* <img  src="/loader.svg" alt="logo" loading='lazy'  className="w-[80px]"/> */}
                        <LoadingSpinner></LoadingSpinner>
                    </div>
                )}
                <div className="fixed bottom-6 left-6 z-50">
                    {showTopButton && (
                        <button type="button" className="btn btn-outline-primary rounded-full p-2 animate-pulse bg-[#fafafa] dark:bg-[#060818] dark:hover:bg-primary" onClick={goToTop}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l4-4m0 0l4 4m-4-4v18" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* BEGIN APP SETTING LAUNCHER */}
                <Setting />
                {/* END APP SETTING LAUNCHER */}

                <div className={`${themeConfig.navbar} main-container text-black dark:text-white-dark min-h-screen`}>
                    {/* BEGIN SIDEBAR */}
                    <Sidebar />
                    {/* END SIDEBAR */}

                    {/* BEGIN CONTENT AREA */}
                    <div className="main-content">
                        {/* BEGIN TOP NAVBAR */}
                        <Header />
                        {/* END TOP NAVBAR */}
                        <Suspense>
                            <div className={`${themeConfig.animation} px-1  animate__animated scrollbar scrollbar-thumb-primary scrollbar-track-primary-50`}>
                                {children}

                                {/* BEGIN FOOTER */}
                                <Footer />
                                {/* END FOOTER */}
                            </div>
                        </Suspense>
                        <Portals />
                        {/* <BomExcessProgressPanel /> */}
                    </div>
                    {/* END CONTENT AREA */}
                </div>
            </div>
            <SnoozeModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                taskId={currentTaskId}
            />
            {callingModals.map(modal => (
                <CallingModal
                    key={modal.id}
                    data={modal.data}
                    onClose={() => setCallingModals(callingModals.filter(m => m.id !== modal.id))}
                />
            ))}

            {logCallModals.map(modal => (
                <LogRecentCall
                    key={modal.id}
                    data={modal.data}
                    onClose={() => setLogCallModals(logCallModals.filter(m => m.id !== modal.id))}
                />
            ))}
        </App>

        {isSupportChatEnabled && <SupportChatWidget />}

        </>
    );
};

export default DefaultLayout;
