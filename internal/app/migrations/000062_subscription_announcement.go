package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext("000062_subscription_announcement.go", up000062SubscriptionAnnouncement, emptyDown)
}

func up000062SubscriptionAnnouncement(ctx context.Context, tx *sql.Tx) error {
	dialect := activeDialect()
	columns := []struct {
		name   string
		sqlite string
		mysql  string
	}{
		{"subscription_announcement", "VARCHAR(512) NOT NULL DEFAULT ''", "VARCHAR(512) NOT NULL DEFAULT ''"},
		{"happ_sub_info_color", "VARCHAR(32) NOT NULL DEFAULT ''", "VARCHAR(32) NOT NULL DEFAULT ''"},
		{"happ_sub_info_button_text", "VARCHAR(64) NOT NULL DEFAULT ''", "VARCHAR(64) NOT NULL DEFAULT ''"},
		{"happ_sub_info_button_link", "VARCHAR(512) NOT NULL DEFAULT ''", "VARCHAR(512) NOT NULL DEFAULT ''"},
		{"happ_sub_expire", "INTEGER NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT 0"},
		{"happ_sub_expire_button_link", "VARCHAR(512) NOT NULL DEFAULT ''", "VARCHAR(512) NOT NULL DEFAULT ''"},
	}

	for _, col := range columns {
		if err := addColumn(ctx, tx, dialect, "subscription_settings", col.name, col.sqlite, col.mysql); err != nil {
			return err
		}
	}
	return nil
}
