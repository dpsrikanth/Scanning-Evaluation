using Newtonsoft.Json;
using ScannerApp.Models;

namespace ScannerApp.Utils;

/// <summary>
/// Reserved zone names that define where to read per-page serial / page-index barcodes.
/// <c>fromPage</c> + page N means the same % rectangle is used on every page N, N+1, … (not only page N).
/// Eligibility is gated by <see cref="ScanTemplate.BarcodeStartPage"/> and the zone's page scope.
/// </summary>
public static class PageSerialZoneHelper
{
    public const string PrimaryZoneKey = "pageserialno";

    /// <summary>Recognized zone names (case-insensitive). <c>pagevalno</c> is a legacy alias.</summary>
    public static bool IsReservedPageSerialName(string? zoneName)
    {
        if (string.IsNullOrWhiteSpace(zoneName)) return false;
        var n = zoneName.Trim();
        return n.Equals(PrimaryZoneKey, StringComparison.OrdinalIgnoreCase)
               || n.Equals("pagevalno", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>First matching zone in template JSON, or null.</summary>
    public static TemplateBarcodeZone? FindPageSerialZone(string? zonesJson)
    {
        if (string.IsNullOrWhiteSpace(zonesJson)) return null;
        List<TemplateBarcodeZone>? zones;
        try
        {
            zones = JsonConvert.DeserializeObject<List<TemplateBarcodeZone>>(zonesJson);
        }
        catch
        {
            return null;
        }

        if (zones == null) return null;
        foreach (var z in zones)
        {
            if (IsReservedPageSerialName(z.ZoneName))
                return z;
        }

        return null;
    }

    /// <summary>
    /// Whether the page-serial zone applies to this 1-based page index for decoding.
    /// </summary>
    public static bool ShouldApplyPageSerialZone(TemplateBarcodeZone z, int pageNumber1Based, int barcodeStartPage1Based)
    {
        if (!IsReservedPageSerialName(z.ZoneName)) return false;
        var start = Math.Max(1, barcodeStartPage1Based);
        if (pageNumber1Based < start) return false;

        if (z.PageScope.Equals("first", StringComparison.OrdinalIgnoreCase))
        {
            // Operators often draw the footer strip on "page 1" in the zone picker; the same % box
            // applies to every sheet. For reserved page-serial zones, treat as "repeat on all content pages".
            if (IsReservedPageSerialName(z.ZoneName))
                return pageNumber1Based >= start;
            return pageNumber1Based == 1;
        }

        // "fromPage": repeat same rectangle from template page N onward (aligned with template UI).
        var fromPg = z.PageNumber > 0 ? z.PageNumber : 1;
        var effectiveFrom = Math.Max(start, fromPg);
        return pageNumber1Based >= effectiveFrom;
    }
}
