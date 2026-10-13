package user

import (
	"context"
	"strings"
	"time"
)

type UserHWIDRecord struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	HWID       string    `json:"hwid"`
	UserAgent  string    `json:"user_agent"`
	LastSeenAt time.Time `json:"last_seen_at"`
	CreatedAt  time.Time `json:"created_at"`
}

const hwidActiveWindow = 2 * time.Minute

func (r Repository) GetUserHWIDs(ctx context.Context, userID int64) ([]UserHWIDRecord, error) {
	cutoffStr := dbTime(time.Now().UTC().Add(-hwidActiveWindow))
	// Purge stale inactive HWIDs
	_, _ = r.db.ExecContext(ctx, `DELETE FROM user_hwids WHERE user_id = ? AND last_seen_at < ?`, userID, cutoffStr)

	rows, err := r.db.QueryContext(ctx, `
		SELECT id, user_id, hwid, COALESCE(user_agent, ''), last_seen_at, created_at
		FROM user_hwids
		WHERE user_id = ? AND last_seen_at >= ?
		ORDER BY last_seen_at DESC
	`, userID, cutoffStr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	records := make([]UserHWIDRecord, 0)
	for rows.Next() {
		var item UserHWIDRecord
		var lastSeen, createdAt any
		if err := rows.Scan(&item.ID, &item.UserID, &item.HWID, &item.UserAgent, &lastSeen, &createdAt); err != nil {
			return nil, err
		}
		if t := parseTimeAny(lastSeen); t != nil {
			item.LastSeenAt = *t
		}
		if t := parseTimeAny(createdAt); t != nil {
			item.CreatedAt = *t
		}
		records = append(records, item)
	}
	return records, rows.Err()
}

func (r Repository) ResetUserHWIDs(ctx context.Context, userID int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM user_hwids WHERE user_id = ?`, userID)
	return err
}

func (r Repository) RecordUserHWID(ctx context.Context, userID int64, hwid string, userAgent string, maxLimit int64) (bool, error) {
	hwid = strings.TrimSpace(hwid)
	if hwid == "" {
		return true, nil
	}

	nowStr := dbTime(time.Now().UTC())
	cutoffStr := dbTime(time.Now().UTC().Add(-hwidActiveWindow))

	// 1. First purge any inactive HWID records for this user
	_, _ = r.db.ExecContext(ctx, `DELETE FROM user_hwids WHERE user_id = ? AND last_seen_at < ?`, userID, cutoffStr)

	// 2. Check if this HWID is already registered for this user
	var existingID int64
	err := r.db.QueryRowContext(ctx, `SELECT id FROM user_hwids WHERE user_id = ? AND hwid = ?`, userID, hwid).Scan(&existingID)
	if err == nil && existingID > 0 {
		_, updateErr := r.db.ExecContext(ctx, `UPDATE user_hwids SET last_seen_at = ?, user_agent = ? WHERE id = ?`, nowStr, userAgent, existingID)
		return true, updateErr
	}

	if maxLimit <= 0 {
		// Unlimited devices
		_, insertErr := r.db.ExecContext(ctx, `
			INSERT INTO user_hwids (user_id, hwid, user_agent, last_seen_at, created_at)
			VALUES (?, ?, ?, ?, ?)
		`, userID, hwid, userAgent, nowStr, nowStr)
		return true, insertErr
	}

	// 3. Count currently active registered devices
	var totalCount int64
	if countErr := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_hwids WHERE user_id = ?`, userID).Scan(&totalCount); countErr != nil {
		return true, countErr
	}

	if totalCount < maxLimit {
		// Space available! Insert new HWID
		_, insertErr := r.db.ExecContext(ctx, `
			INSERT INTO user_hwids (user_id, hwid, user_agent, last_seen_at, created_at)
			VALUES (?, ?, ?, ?, ?)
		`, userID, hwid, userAgent, nowStr, nowStr)
		return true, insertErr
	}

	// 4. Limit reached. Check if any device has become inactive
	var activeCount int64
	if countErr := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_hwids WHERE user_id = ? AND last_seen_at >= ?`, userID, cutoffStr).Scan(&activeCount); countErr != nil {
		activeCount = totalCount
	}

	if activeCount < maxLimit {
		// An older device was disconnected/inactive! Evict the oldest inactive HWID and register the new one
		var oldestID int64
		if scanErr := r.db.QueryRowContext(ctx, `SELECT id FROM user_hwids WHERE user_id = ? ORDER BY last_seen_at ASC LIMIT 1`, userID).Scan(&oldestID); scanErr == nil && oldestID > 0 {
			r.db.ExecContext(ctx, `DELETE FROM user_hwids WHERE id = ?`, oldestID)
		}
		_, insertErr := r.db.ExecContext(ctx, `
			INSERT INTO user_hwids (user_id, hwid, user_agent, last_seen_at, created_at)
			VALUES (?, ?, ?, ?, ?)
		`, userID, hwid, userAgent, nowStr, nowStr)
		return true, insertErr
	}

	// All allowed device slots are actively in use! Block access.
	return false, nil
}

func parseTimeAny(val any) *time.Time {
	if val == nil {
		return nil
	}
	switch v := val.(type) {
	case time.Time:
		return &v
	case *time.Time:
		return v
	case string:
		for _, layout := range []string{time.RFC3339, "2006-01-02 15:04:05", "2006-01-02T15:04:05Z07:00"} {
			if t, err := time.Parse(layout, v); err == nil {
				return &t
			}
		}
	}
	return nil
}
