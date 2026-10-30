START TRANSACTION;
CREATE TABLE file_annotations (
    id uuid NOT NULL,
    file_id uuid NOT NULL,
    student_id uuid NOT NULL,
    page_number integer NOT NULL,
    annotation_type integer NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_file_annotations PRIMARY KEY (id),
    CONSTRAINT ck_file_annotations_page CHECK ((page_number >= 1)),
    CONSTRAINT fk_file_annotations_library_files_file_id FOREIGN KEY (file_id) REFERENCES library_files (id) ON DELETE CASCADE,
    CONSTRAINT fk_file_annotations_students_student_id FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
);

CREATE INDEX ix_file_annotations_file_id_student_id ON file_annotations (file_id, student_id);

CREATE INDEX ix_file_annotations_student_id_file_id_created_at ON file_annotations (student_id, file_id, created_at);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261030102811_Phase60AddFileAnnotations', '9.0.0');

COMMIT;


