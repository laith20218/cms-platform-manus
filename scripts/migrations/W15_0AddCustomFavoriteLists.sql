START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261118120000_AddCustomFavoriteLists') THEN
    CREATE TABLE favorite_lists (
        id uuid NOT NULL,
        student_id uuid NOT NULL,
        name character varying(100) NOT NULL,
        description character varying(500),
        color character varying(20),
        created_at timestamp with time zone NOT NULL,
        updated_at timestamp with time zone NOT NULL,
        created_by uuid NOT NULL,
        deleted_at timestamp with time zone,
        deleted_by uuid,
        CONSTRAINT pk_favorite_lists PRIMARY KEY (id),
        CONSTRAINT fk_favorite_lists_students_student_id FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261118120000_AddCustomFavoriteLists') THEN
    CREATE TABLE favorite_list_items (
        id uuid NOT NULL,
        favorite_list_id uuid NOT NULL,
        question_id uuid NOT NULL,
        created_at timestamp with time zone NOT NULL,
        updated_at timestamp with time zone NOT NULL,
        CONSTRAINT pk_favorite_list_items PRIMARY KEY (id),
        CONSTRAINT fk_favorite_list_items_favorite_lists_favorite_list_id FOREIGN KEY (favorite_list_id) REFERENCES favorite_lists (id) ON DELETE CASCADE,
        CONSTRAINT fk_favorite_list_items_questions_question_id FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261118120000_AddCustomFavoriteLists') THEN
    CREATE UNIQUE INDEX ix_favorite_list_items_favorite_list_id_question_id ON favorite_list_items (favorite_list_id, question_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261118120000_AddCustomFavoriteLists') THEN
    CREATE INDEX ix_favorite_list_items_question_id ON favorite_list_items (question_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261118120000_AddCustomFavoriteLists') THEN
    CREATE INDEX ix_favorite_lists_student_id ON favorite_lists (student_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261118120000_AddCustomFavoriteLists') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261118120000_AddCustomFavoriteLists', '9.0.0');
    END IF;
END $EF$;
COMMIT;

