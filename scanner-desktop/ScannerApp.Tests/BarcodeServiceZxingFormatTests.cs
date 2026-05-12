using System.Drawing;
using System.Drawing.Imaging;
using ScannerApp.Services;
using Xunit;

namespace ScannerApp.Tests;

public class BarcodeServiceZxingFormatTests
{
    [Fact]
    public void ReadBarcode_OnIndexedFormat_DoesNotThrow()
    {
        using var pal = new Bitmap(64, 64, PixelFormat.Format8bppIndexed);
        var svc = new BarcodeService();
        var ex = Record.Exception(() => svc.ReadBarcode(pal));
        Assert.Null(ex);
    }

    [Fact]
    public void ReadPageSerialOrFooter_WithoutZone_DoesNotThrow()
    {
        using var bmp = new Bitmap(48, 48, PixelFormat.Format24bppRgb);
        var svc = new BarcodeService();
        var ex = Record.Exception(() => svc.ReadPageSerialOrFooter(bmp, pageNumber1Based: 3, barcodeStartPage1Based: 3, zonesJson: null));
        Assert.Null(ex);
    }

    [Fact]
    public void ReadPageSerialOrFooter_WithZoneJson_DoesNotThrow_ZoneUsedWhenPresent()
    {
        const string zonesJson =
            """[{"zoneName":"pageserialno","pageScope":"fromPage","pageNumber":1,"xPct":0,"yPct":0,"wPct":100,"hPct":100,"hint":"ANY"}]""";
        using var bmp = new Bitmap(32, 32, PixelFormat.Format24bppRgb);
        var svc = new BarcodeService();
        var ex = Record.Exception(() => svc.ReadPageSerialOrFooter(bmp, 3, 3, zonesJson));
        Assert.Null(ex);
    }
}
