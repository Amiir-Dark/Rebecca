package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddNamedMigrationContext("000063_happ_announcement_target_users.go", up000063HappAnnouncementTargetUsers, emptyDown)
}

func up000063HappAnnouncementTargetUsers(ctx context.Context, tx *sql.Tx) error {
	dialect := activeDialect()
	columns := []struct {
		name   string
		sqlite string
		mysql  string
	}{
		{"happ_announcement_target_type", "VARCHAR(32) NOT NULL DEFAULT 'all'", "VARCHAR(32) NOT NULL DEFAULT 'all'"},
		{"happ_announcement_target_users", "TEXT NOT NULL DEFAULT ''", "TEXT NOT NULL DEFAULT ''"},
	}

	for _, col := range columns {
		if err := addColumn(ctx, tx, dialect, "subscription_settings", col.name, col.sqlite, col.mysql); err != nil {
			return err
		}
	}
	return nil
}
