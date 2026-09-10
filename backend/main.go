package main

import (
	"log"
	"net"
	"net/url"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}
	ConnectDatabase()

	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		origin := c.Request.Header.Get("Origin")
		allowedOrigins := strings.Split(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5175"), ",")
		originAllowed := isOriginAllowed(origin, allowedOrigins)

		if origin != "" && originAllowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := r.Group("/api")
	{
		api.GET("/health", HealthHandler)
		api.GET("/public/overview", PublicOverviewHandler)

		// Auth Routes
		api.POST("/register", RegisterHandler)
		api.POST("/login", LoginHandler)
		api.POST("/google-login", GoogleLoginHandler)
		api.POST("/forgot-password", ForgotPasswordHandler)

		protected := api.Group("/")
		protected.Use(AuthMiddleware())
		protected.Use(ActivityLogMiddleware())
		{
			// User Dashboard & Assessment
			protected.GET("/dashboard", UserDashboardHandler)
			protected.GET("/assessment", AssessmentGetHandler)
			protected.POST("/assessment/submit", AssessmentSubmitHandler)
			protected.GET("/mbti/questions", MBTIQuestionsHandler)
			protected.POST("/mbti/submit", MBTISubmitHandler)
			protected.GET("/user/mbti/latest", UserLatestMBTIHandler)
			protected.GET("/assistant/context", AssistantContextHandler)
			protected.POST("/assistant/chat", AssistantChatHandler)
			protected.POST("/assistant/schedule/optimize", AssistantScheduleOptimizeHandler)
			protected.GET("/cinema/discovery", CinemaDiscoveryHandler)
			protected.GET("/user/films", UserFilmsGetHandler)
			protected.POST("/user/films", UserFilmsCreateHandler)
			protected.PATCH("/user/films/:id", UserFilmsUpdateHandler)
			protected.DELETE("/user/films/:id", UserFilmsDeleteHandler)
			protected.POST("/user/films/:id/watch", UserFilmWatchEventHandler)
			protected.POST("/user/film-recommendations", UserFilmRecommendationCreateHandler)

			// Social & Profile
			protected.GET("/user/history", UserHistoryHandler)
			protected.GET("/user/risk-timeline", UserRiskTimelineHandler)
			protected.GET("/user/daily-brief", UserDailyBriefHandler)
			protected.GET("/user/recovery-plan", UserRecoveryPlanHandler)
			protected.GET("/user/checkins", UserCheckInsHandler)
			protected.POST("/user/checkins", UserCheckInCreateHandler)
			protected.GET("/user/profile", UserProfileGetHandler)
			protected.PUT("/user/profile", UserProfilePutHandler)
			protected.GET("/network/users", NetworkUsersHandler)
			protected.POST("/network/follow/:id", NetworkFollowHandler)
			protected.POST("/network/affinity/:id", NetworkAffinityHandler)
			protected.GET("/network/conversations", NetworkConversationsHandler)
			protected.GET("/network/messages/:userId", NetworkMessagesHandler)
			protected.POST("/network/messages/:userId", NetworkSendMessageHandler)
			protected.GET("/network/user/:username", NetworkUserProfileHandler)

			// Curhat & Gossip
			protected.GET("/gosip", GosipGetHandler)
			protected.POST("/curhat/submit", CurhatSubmitHandler)
			protected.POST("/curhat/:id/reply", CurhatReplyHandler)
			protected.POST("/post/create", PostCreateHandler)
			protected.GET("/user/curhat", UserCurhatHandler)

			// Feed & Post Interactions
			protected.GET("/feed", FeedGetHandler)
			protected.POST("/post/:id/like", PostLikeHandler)
			protected.GET("/post/:id/comments", PostCommentsGetHandler)
			protected.POST("/post/:id/comment", PostCommentCreateHandler)

			// Notifications
			protected.GET("/notifications/unread", NotificationsUnreadHandler)
			protected.POST("/notifications/:id/read", NotificationsReadHandler)
			protected.GET("/user/notifications", UserNotificationsHandler)
			protected.PATCH("/user/treatment/:id/status", UserTreatmentStatusHandler)
			protected.GET("/user/treatment/:id/replies", UserTreatmentRepliesHandler)
			protected.POST("/user/treatment/:id/replies", UserTreatmentReplyCreateHandler)

			// Therapy Recommendation
			protected.GET("/terapi", UserDashboardHandler) // Same output logic as dashboard for prediction

			// Happiness Analytics (mahasiswa / student)
			student := protected.Group("/")
			student.Use(RequireRole(RoleStudent))
			student.GET("/happiness/questions", HappinessQuestionsHandler)
			student.POST("/happiness/assessment/submit", HappinessSubmitHandler)
			student.GET("/happiness", HappinessLatestHandler)
			student.GET("/happiness/history", HappinessHistoryHandler)
			student.GET("/happiness/trend", HappinessTrendHandler)
			student.GET("/well-being", WellBeingHandler)
			student.GET("/student/referrals", StudentReferralsHandler)
			student.PATCH("/student/referrals/:id/status", StudentReferralStatusHandler)
			student.GET("/dpa/directory", DpaDirectoryHandler)
			student.POST("/student/join-dpa/:id", StudentJoinDpaHandler)
			student.GET("/student/bimbingan", StudentBimbinganHandler)
			student.POST("/student/bimbingan", StudentCreateBimbinganHandler)
			student.POST("/dpa/ratings/:dpaId", DpaRateHandler)
			student.GET("/dpa/ratings/me", DpaMyRatingHandler)

			// DPA Routes (dosen pembimbing akademik, scope mahasiswa bimbingan)
			dpa := protected.Group("/")
			dpa.Use(RequireRole(RoleDPA))
			dpa.GET("/dpa/dashboard", DpaDashboardHandler)
			dpa.GET("/dpa/students", DpaStudentsHandler)
			dpa.GET("/dpa/students/:id", DpaStudentDetailHandler)
			dpa.GET("/dpa/students/:id/notes", DpaStudentNotesHandler)
			dpa.POST("/dpa/students/:id/notes", DpaStudentNotesHandler)
			dpa.GET("/dpa/students/:id/referrals", DpaListReferralsHandler)
			dpa.POST("/dpa/students/:id/referrals", DpaCreateReferralHandler)
			dpa.GET("/dpa/warnings", DpaWarningsHandler)
			dpa.GET("/dpa/students/:id/report", DpaStudentReportHandler)
			dpa.POST("/dpa/students/:id/remove-group", DpaRemoveStudentGroupHandler)
			dpa.GET("/dpa/bimbingan", DpaBimbinganHandler)
			dpa.POST("/dpa/bimbingan", DpaCreateBimbinganHandler)
			dpa.PATCH("/dpa/bimbingan/:id/status", DpaBimbinganStatusHandler)
			dpa.POST("/dpa/bimbingan/report", DpaBimbinganReportHandler)
			dpa.GET("/dpa/bimbingan/reports", DpaBimbinganReportsHandler)

			// Grup chat bimbingan: satu grup per DPA, diakses DPA dan
			// mahasiswa bimbingannya (handler bercabang berdasarkan role).
			chat := protected.Group("/")
			chat.Use(RequireRole(RoleStudent, RoleDPA))
			chat.GET("/dpa/chat", DpaChatMessagesHandler)
			chat.POST("/dpa/chat/send", DpaChatSendHandler)
			chat.POST("/dpa/chat/polls/:id/vote", DpaChatVoteHandler)

			// Stream SSE realtime (token via query-param karena EventSource
			// tidak dapat mengirim header Authorization).
			sse := api.Group("/")
			sse.Use(SSEAuthMiddleware())
			sse.Use(RequireRole(RoleStudent, RoleDPA))
			sse.GET("/dpa/chat/stream", DpaChatStreamHandler)
			sse.GET("/dpa/chat/attachments/:id", DpaChatAttachmentHandler)


			// Akses token query-param untuk staf (unduh dokumen laporan
			// lewat elemen a yang tidak bisa mengirim header Authorization).
			tokenAPI := api.Group("/")
			tokenAPI.Use(SSEAuthMiddleware())
			tokenAPI.Use(RequireRole(RoleStaff, RoleSuperadmin))
			tokenAPI.GET("/staff/bimbingan/reports/:id/report", StaffBimbinganReportDocHandler)

			// Staf Kampus: pemrosesan laporan syarat UTS/UAS
			staff := protected.Group("/")
			staff.Use(RequireRole(RoleStaff, RoleSuperadmin))
			staff.GET("/staff/bimbingan/reports", StaffBimbinganReportsHandler)
			staff.GET("/staff/bimbingan/reports/:id", StaffBimbinganReportDetailHandler)
			staff.PATCH("/staff/bimbingan/reports/:id/status", StaffBimbinganReportStatusHandler)

			// Superadmin / Kaprodi Routes (administratif + analytics prodi)
			superadmin := protected.Group("/")
			superadmin.Use(RequireRole(RoleSuperadmin))
			superadmin.GET("/responden", RespondenGetHandler)
			superadmin.GET("/responden/:id/history", RespondenHistoryHandler)

			superadmin.GET("/admin/users", AdminUsersGetHandler)
			superadmin.POST("/admin/users", AdminUsersCreateHandler)
			superadmin.POST("/admin/users/bulk-dpa", AdminBulkDpaHandler)
			superadmin.GET("/admin/users/:id", AdminUsersGetByIDHandler)
			superadmin.PUT("/admin/users/:id", AdminUsersPutHandler)
			superadmin.DELETE("/admin/users/:id", AdminUsersDeleteHandler)
			superadmin.POST("/admin/users/:id/treatment", AdminUsersTreatmentHandler)
			superadmin.GET("/admin/users/:id/treatments", AdminUserTreatmentsHandler)
			superadmin.GET("/admin/treatment-replies", AdminTreatmentRepliesHandler)
			superadmin.PATCH("/admin/treatment-replies/:id/read", AdminTreatmentReplyReadHandler)
			superadmin.GET("/admin/curhat-analysis", AdminCurhatAnalysisHandler)
			superadmin.PATCH("/admin/curhat-analysis/:id/status", AdminCurhatAnalysisStatusHandler)
			superadmin.GET("/admin/command-center", AdminCommandCenterHandler)
			superadmin.GET("/admin/launch-readiness", AdminLaunchReadinessHandler)
			superadmin.GET("/admin/risk-center", AdminRiskCenterHandler)
			superadmin.GET("/admin/users/:id/timeline", AdminUserTimelineHandler)
			superadmin.GET("/admin/users/:id/case-summary", AdminUserCaseSummaryHandler)
			superadmin.GET("/admin/users/:id/report", AdminUserReportExportHandler)
			superadmin.PATCH("/admin/triage/:type/:id/status", AdminTriageStatusHandler)

			superadmin.GET("/admin/analytics", AdminAnalyticsHandler)
			superadmin.GET("/admin/happiness", AdminHappinessAnalyticsHandler)
			superadmin.GET("/superadmin/dpa-ratings", SuperadminDpaRatingsHandler)
			superadmin.GET("/admin/config", AdminConfigGetHandler)
			superadmin.PUT("/admin/config", AdminConfigPutHandler)
			superadmin.GET("/admin/quantum", AdminQuantumHandler)
			superadmin.GET("/admin/model-evaluation", AdminModelEvaluationV2Handler)
			superadmin.GET("/admin/activity-logs", AdminActivityLogsHandler)
			superadmin.GET("/admin/system-health", AdminSystemHealthHandler)
		}
	}

	port := getEnv("PORT", "8080")
	if !strings.HasPrefix(port, ":") {
		port = ":" + port
	}
	if err := r.Run(port); err != nil {
		_, _ = os.Stderr.WriteString(err.Error())
	}
}

func isOriginAllowed(origin string, allowedOrigins []string) bool {
	if origin == "" {
		return true
	}
	for _, allowedOrigin := range allowedOrigins {
		allowedOrigin = strings.TrimSpace(allowedOrigin)
		if allowedOrigin == "*" || allowedOrigin == origin {
			return true
		}
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsPrivate() || ip.IsLoopback()
}
