# WIP_STATUS — wip/11.3

## Base
Branch: wip/11.3
Parent: 20f4bf65a45cd04021b155f636f42b99e2c9f9c8 (main, Push 11.1 merged; 11.2-DIAG design APPROVED)
Status: PART A COMPLETE. PARTS B–E in progress.
CRITICAL: migration file generated but NOT applied to any DB (STOP GATE §2/§3).

## PART A — Migration AddEpisodeFavorites (FILE ONLY — NOT APPLIED)
- Entity: Favorite gains `Guid? CourseEpisodeId` + `CourseEpisode?` nav
  (apps/api/src/CMS.Domain/Entities/OperationalEntities.cs:172-193).
- DbContext (apps/api/src/CMS.Infrastructure/Persistence/ApplicationDbContext.cs:287-312):
  * CHECK ck_favorites_exactly_one_target → ternary (question|file|episode exactly-one);
  * NEW unique partial index ix_favorites_student_id_course_episode_id
    (filter "course_episode_id IS NOT NULL") — matches the two existing siblings;
  * FK favorites.course_episode_id → course_episodes.id ON DELETE RESTRICT (documented
    rationale in code: deleting an episode must not silently delete students' favorites).
- Migration file: apps/api/src/CMS.Infrastructure/Persistence/Migrations/
  20261027013220_AddEpisodeFavorites.cs (+ .Designer.cs) — generated via
  `dotnet ef migrations add` (design-time factory + placeholder CMS_EF_CONNECTION; no DB touched).
- SQL extracted to /tmp/add_episode_favorites.sql (`dotnet ef migrations script
  20261026014837_AddTargetQuality AddEpisodeFavorites …`) — full script included in the
  push report for supervisor review.
- Pre-flight: every existing row has course_episode_id NULL → satisfies ternary CHECK
  branches 1/2 → constraint swap is safe on live data. EF also auto-adds the conventional
  non-unique FK-support index ix_favorites_course_episode_id (expected, mirrors the
  question/library FK indexes from Phase34).
- `dotnet ef database update` NOT run. No DB touched anywhere.

## RESUME_FROM
(after each part) — PART A done; PART B (backend MediatR) next.
