#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use sqlx::sqlite::SqlitePoolOptions;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![Migration {
        version: 1,
        description: "create work_items table",
        sql: include_str!("db/migrations/001_create_work_items.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:tracksy.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;
            let db_path = app_dir.join("tracksy.db");
            let pool = tauri::async_runtime::block_on(async {
                SqlitePoolOptions::new()
                    .connect(&format!("sqlite:{}?mode=rwc", db_path.display()))
                    .await
                    .expect("failed to connect to database")
            });
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::work_items::create_work_item,
            commands::work_items::update_work_item,
            commands::work_items::delete_work_item,
            commands::work_items::get_tree,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
