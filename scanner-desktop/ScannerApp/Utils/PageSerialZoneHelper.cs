using System.Drawing;
using Newtonsoft.Json;
using ScannerApp.Models;

namespace ScannerApp.Utils;

/// <summary>
/// Reserved zone names for template validation, preview overlay, and decode ROI.
/// Page-index barcodes are read from the configured <c>pageserialno</c> rectangle when it applies to the page;
/// <see cref="BarcodeService.ReadPageSerialOrFooterWithDiag"/> falls back to bottom-right corner crops if that fails.
/// <c>fromPage</c> + page N in JSON is kept for backward compatibility with stored templates.
/// Eligibility is gated by <see cref="ScanTemplate.BarcodeStartPage"/> (pages below start skip serial read).
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

    /// <summary>Pixel rectangle for a zone as a fraction of width/height (matches <see cref="BarcodeService"/>).</summary>
    public static Rectangle ZoneToRectanglePixels(int imageWidth, int imageHeight, TemplateBarcodeZone z)
    {
        int px = (int)Math.Round(imageWidth * z.XPct / 100.0);
        int py = (int)Math.Round(imageHeight * z.YPct / 100.0);
        int pw = Math.Max(8, (int)Math.Round(imageWidth * z.WPct / 100.0));
        int ph = Math.Max(8, (int)Math.Round(imageHeight * z.HPct / 100.0));
        return new Rectangle(px, py, pw, ph);
    }

    /// <summary>
    /// When the template defines an applicable <c>pageserialno</c> zone, returns its pixel rectangle for overlays / ROI.
    /// </summary>
    public static bool TryGetPageSerialPixelRectangle(
        int imageWidth,
        int imageHeight,
        string? zonesJson,
        int pageNumber1Based,
        int barcodeStartPage1Based,
        out Rectangle rect)
    {
        rect = default;
        if (imageWidth < 16 || imageHeight < 16) return false;
        var z = FindPageSerialZone(zonesJson);
        if (z == null) return false;
        if (!ShouldApplyPageSerialZone(z, pageNumber1Based, barcodeStartPage1Based)) return false;
        rect = ZoneToRectanglePixels(imageWidth, imageHeight, z);
        return rect.Width >= 4 && rect.Height >= 4;
    }
}
