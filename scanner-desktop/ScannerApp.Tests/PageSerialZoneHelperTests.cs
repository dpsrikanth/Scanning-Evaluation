using ScannerApp.Models;
using ScannerApp.Utils;
using Xunit;

namespace ScannerApp.Tests;

public class PageSerialZoneHelperTests
{
    [Fact]
    public void IsReservedPageSerialName_RecognizesKeys()
    {
        Assert.True(PageSerialZoneHelper.IsReservedPageSerialName("pageserialno"));
        Assert.True(PageSerialZoneHelper.IsReservedPageSerialName("PAGESERIALNO"));
        Assert.True(PageSerialZoneHelper.IsReservedPageSerialName("pagevalno"));
        Assert.False(PageSerialZoneHelper.IsReservedPageSerialName("barcodefilename"));
    }

    [Fact]
    public void FindPageSerialZone_ReturnsFirstReservedMatch()
    {
        const string json =
            """[{"zoneName":"barcodefilename","pageScope":"first","pageNumber":1,"xPct":0,"yPct":0,"wPct":10,"hPct":10,"hint":"ANY"},{"zoneName":"pageserialno","pageScope":"fromPage","pageNumber":3,"xPct":1,"yPct":90,"wPct":30,"hPct":8,"hint":"CODE_128"}]""";
        var z = PageSerialZoneHelper.FindPageSerialZone(json);
        Assert.NotNull(z);
        Assert.Equal("pageserialno", z.ZoneName);
        Assert.Equal(3, z.PageNumber);
    }

    [Theory]
    [InlineData(2, 3, false)]
    [InlineData(3, 3, true)]
    [InlineData(3, 5, false)]
    [InlineData(5, 3, true)]
    public void ShouldApplyPageSerialZone_FromPageAndBarcodeStart(int page, int zoneFrom, bool expectOk)
    {
        var z = new TemplateBarcodeZone
        {
            ZoneName = PageSerialZoneHelper.PrimaryZoneKey,
            PageScope = "fromPage",
            PageNumber = zoneFrom,
            XPct = 0,
            YPct = 0,
            WPct = 10,
            HPct = 10,
        };
        Assert.Equal(expectOk, PageSerialZoneHelper.ShouldApplyPageSerialZone(z, page, barcodeStartPage1Based: 3));
    }

    [Fact]
    public void ZoneToRectanglePixels_MatchesPercentRounding()
    {
        var z = new TemplateBarcodeZone
        {
            ZoneName = PageSerialZoneHelper.PrimaryZoneKey,
            XPct = 1,
            YPct = 90,
            WPct = 30,
            HPct = 8,
        };
        var r = PageSerialZoneHelper.ZoneToRectanglePixels(1000, 2000, z);
        Assert.Equal(10, r.X);
        Assert.Equal(1800, r.Y);
        Assert.Equal(300, r.Width);
        Assert.Equal(160, r.Height);
    }

    [Fact]
    public void TryGetPageSerialPixelRectangle_RespectsBarcodeStart()
    {
        const string json =
            """[{"zoneName":"pageserialno","pageScope":"fromPage","pageNumber":3,"xPct":0,"yPct":0,"wPct":10,"hPct":10,"hint":"ANY"}]""";
        Assert.False(PageSerialZoneHelper.TryGetPageSerialPixelRectangle(100, 100, json, 2, 3, out _));
        Assert.True(PageSerialZoneHelper.TryGetPageSerialPixelRectangle(100, 100, json, 3, 3, out var r));
        Assert.True(r.Width >= 4 && r.Height >= 4);
    }

    [Fact]
    public void ShouldApplyPageSerialZone_FirstScope_RepeatsFooterBoxOnEveryContentPage()
    {
        var z = new TemplateBarcodeZone
        {
            ZoneName = "pageserialno",
            PageScope = "first",
            PageNumber = 1,
            XPct = 0,
            YPct = 0,
            WPct = 10,
            HPct = 10,
        };
        Assert.False(PageSerialZoneHelper.ShouldApplyPageSerialZone(z, 2, barcodeStartPage1Based: 3));
        Assert.True(PageSerialZoneHelper.ShouldApplyPageSerialZone(z, 3, barcodeStartPage1Based: 3));
        Assert.True(PageSerialZoneHelper.ShouldApplyPageSerialZone(z, 42, barcodeStartPage1Based: 3));
    }
}
