using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations;

/// <summary>
/// Wave 16.5 — admin-managed site content pages (Terms / Privacy / Contact).
/// The table is slug-addressed with Arabic title/body (markdown-lite body:
/// blank-line paragraphs, «## » section headings). Seed rows carry the exact
/// text that used to live in the hardcoded TermsPage/PrivacyPage components
/// (plus a neutral contact stub the admin edits); student-web now renders
/// these rows instead of the hardcoded components.
/// </summary>
public partial class AddContentPages : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "content_pages",
            columns: table => new
            {
                id = table.Column<Guid>(type: "uuid", nullable: false),
                slug = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                title_ar = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                body_ar = table.Column<string>(type: "character varying(20000)", maxLength: 20000, nullable: false),
                updated_by = table.Column<Guid>(type: "uuid", nullable: true),
                created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_content_pages", x => x.id);
            });

        migrationBuilder.CreateIndex(
            name: "ix_content_pages_slug",
            table: "content_pages",
            column: "slug",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_content_pages_updated_at",
            table: "content_pages",
            column: "updated_at");

        // ===== Seed: the three W16.5 pages =====
        // terms / privacy carry the exact text from the retired hardcoded
        // components (TermsPage.tsx / PrivacyPage.tsx); contact starts as a
        // neutral stub the admin personalizes from the admin-web editor.
        migrationBuilder.InsertData(
            table: "content_pages",
            columns: new[] { "id", "slug", "title_ar", "body_ar", "updated_by", "created_at", "updated_at" },
            values: new object[,]
            {
                {
                    new Guid("a1000000-0000-4000-8000-000000000001"),
                    "terms",
                    "شروط الاستخدام",
                    "باستخدامك لمنصة CMS الطبية، فإنك توافق على الشروط التالية:\n\n## 1. الاستخدام الشخصي\nالمحتوى التعليمي مخصص لاستخدامك الشخصي فقط. لا يجوز إعادة توزيعه أو مشاركته مع أطراف ثالثة.\n\n## 2. الملكية الفكرية\nجميع المواد التعليمية محمية بحقوق الملكية الفكرية. العلامة المائية المطبقة على الملفات تحدد هويتك.\n\n## 3. سلوك المستخدم\nيجب الالتزام بآداب الاستخدام. لا يجوز محاولة الوصول غير المصرح به أو اختراق النظام.\n\n## 4. التعديلات\nقد يتم تحديث هذه الشروط من وقت لآخر. استمرار استخدامك للمنصة يعني موافقتك على الشروط المحدثة.",
                    null,
                    new DateTime(2026, 11, 18, 0, 0, 0, DateTimeKind.Utc),
                    new DateTime(2026, 11, 18, 0, 0, 0, DateTimeKind.Utc)
                },
                {
                    new Guid("a1000000-0000-4000-8000-000000000002"),
                    "privacy",
                    "سياسة الخصوصية",
                    "نحن في منصة CMS الطبية نولي خصوصيتك أهمية قصوى. إليك كيف نتعامل مع بياناتك:\n\n## 1. البيانات التي نجمعها\nنجمع الاسم، رقم الهاتف، الجامعة، والكلية لتقديم خدمة تعليمية مخصصة. لا نطلب معلومات حساسة كأرقام الحسابات البنكية.\n\n## 2. استخدام البيانات\nتُستخدم بياناتك لتخصيص المحتوى التعليمي، إرسال الإشعارات، وتحسين جودة المنصة. لا نبيع بياناتك لأطراف ثالثة.\n\n## 3. حماية البيانات\nنستخدم تشفير AES-256 للتخزين، TLS 1.3 للنقل، وعلامات مائية ديناميكية لحماية المحتوى. الوصول مقيد بصلاحيات RBAC.\n\n## 4. ربط الجهاز\nنربط حسابك بجهاز محدد لمنع الاستخدام غير المصرح به. يمكنك التواصل مع الدعم لإلغاء ربط الجهاز عند الحاجة.\n\n## 5. حقوقك\nلك الحق في الوصول إلى بياناتك، طلب تعديلها أو حذفها. تواصل مع الدعم الفني لممارسة هذه الحقوق.",
                    null,
                    new DateTime(2026, 11, 18, 0, 0, 0, DateTimeKind.Utc),
                    new DateTime(2026, 11, 18, 0, 0, 0, DateTimeKind.Utc)
                },
                {
                    new Guid("a1000000-0000-4000-8000-000000000003"),
                    "contact",
                    "تواصل معنا",
                    "فريق منصة CMS الطبية جاهز لمساعدتك في كل ما يتعلق بحسابك أو اشتراكك أو المحتوى التعليمي.\n\n## قنوات التواصل\nيمكنك التواصل مع فريق الدعم عبر قنوات الدعم المعتمدة التي تعلنها إدارة المنصة.\n\n## قبل أن تسأل\nراجع الأسئلة الشائعة داخل المنصة أولاً — تجيب معظم الاستفسارات الشائعة عن نفسها وتوفر وقتك.",
                    null,
                    new DateTime(2026, 11, 18, 0, 0, 0, DateTimeKind.Utc),
                    new DateTime(2026, 11, 18, 0, 0, 0, DateTimeKind.Utc)
                }
            });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "content_pages");
    }
}
