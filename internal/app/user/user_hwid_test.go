package user

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func setupTestDBWithHWID(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open sqlite in memory: %v", err)
	}

	_, err = db.Exec(`
		CREATE TABLE users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username VARCHAR(34) NOT NULL,
			device_limit_type VARCHAR(16) NOT NULL DEFAULT 'ip',
			ip_limit INTEGER NOT NULL DEFAULT 0
		);

		CREATE TABLE user_hwids (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			hwid VARCHAR(128) NOT NULL,
			user_agent TEXT NOT NULL DEFAULT '',
			last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, hwid)
		);
	`)
	if err != nil {
		t.Fatalf("failed to create tables: %v", err)
	}

	return db
}

func TestRecordUserHWID_LimitEnforcement(t *testing.T) {
	db := setupTestDBWithHWID(t)
	defer db.Close()

	ctx := context.Background()
	repo := Repository{db: db}

	userID := int64(42)
	maxLimit := int64(1)

	// 1. First device connects -> allowed
	allowed, err := repo.RecordUserHWID(ctx, userID, "device-1", "Happ/1.63.1", maxLimit)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allowed {
		t.Fatalf("expected first device to be allowed")
	}

	// 2. Same device reconnects -> allowed
	allowed, err = repo.RecordUserHWID(ctx, userID, "device-1", "Happ/1.63.1", maxLimit)
	if err != nil || !allowed {
		t.Fatalf("expected same device to be allowed, got allowed=%v err=%v", allowed, err)
	}

	// 3. Second device connects while first is active -> BLOCKED
	allowed, err = repo.RecordUserHWID(ctx, userID, "device-2", "Happ/1.63.1", maxLimit)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatalf("expected second device to be blocked when limit=1 and device-1 is active")
	}

	// 4. Age device-1 past the active window (simulate disconnect/inactivity)
	pastTime := time.Now().UTC().Add(-10 * time.Minute)
	_, err = db.Exec(`UPDATE user_hwids SET last_seen_at = ? WHERE hwid = 'device-1'`, dbTime(pastTime))
	if err != nil {
		t.Fatalf("failed to age device-1: %v", err)
	}

	// Now device-2 connects -> should be ALLOWED because device-1 disconnected/inactive!
	allowed, err = repo.RecordUserHWID(ctx, userID, "device-2", "Happ/1.63.1", maxLimit)
	if err != nil || !allowed {
		t.Fatalf("expected device-2 to be allowed after device-1 disconnected, got allowed=%v err=%v", allowed, err)
	}

	// 5. Check GetUserHWIDs
	hwids, err := repo.GetUserHWIDs(ctx, userID)
	if err != nil {
		t.Fatalf("failed to get user hwids: %v", err)
	}
	if len(hwids) != 1 || hwids[0].HWID != "device-2" {
		t.Fatalf("expected only device-2 in active hwids, got %v", hwids)
	}

	// 6. Test ResetUserHWIDs
	if err := repo.ResetUserHWIDs(ctx, userID); err != nil {
		t.Fatalf("failed to reset hwids: %v", err)
	}
	hwidsAfterReset, err := repo.GetUserHWIDs(ctx, userID)
	if err != nil {
		t.Fatalf("failed to get hwids after reset: %v", err)
	}
	if len(hwidsAfterReset) != 0 {
		t.Fatalf("expected 0 hwids after reset, got %d", len(hwidsAfterReset))
	}
}
