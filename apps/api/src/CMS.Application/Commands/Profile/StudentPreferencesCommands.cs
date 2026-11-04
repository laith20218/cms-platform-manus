using System.Text.Json.Nodes;
using MediatR;

namespace CMS.Application.Commands.Profile;

/// <summary>
/// W15.0 — reads the caller's Preferences JSON column (UserEntities). Returns the stored
/// object as-is (pass-through contract: the column is schema-free by design so the client
/// can evolve keys — e.g. last-filter state — without API churn).
/// </summary>
public sealed record GetStudentPreferencesQuery(
    Guid StudentId
) : IRequest<JsonObject>;

/// <summary>
/// W15.0 — replaces the Preferences JSON column. The handler validates object-kind and an
/// 8 KB size cap, then stores the CANONICAL serialization of the parsed object (stable
/// key order, no whitespace drift). Returns the stored object.
/// </summary>
public sealed record UpdateStudentPreferencesCommand(
    Guid StudentId,
    /// <summary>Raw JSON text from the request body (already syntax-checked by model binding).</summary>
    string PreferencesJson
) : IRequest<JsonObject>;
