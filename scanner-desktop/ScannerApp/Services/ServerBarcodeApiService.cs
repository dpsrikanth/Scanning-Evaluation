using System.Drawing;
using System.Drawing.Imaging;
using System.Net.Http;
using System.Text;
using Newtonsoft.Json;
using ScannerApp.Utils;

namespace ScannerApp.Services
{
    /// <summary>
    /// Optional server-side barcode decoder client.
    /// Keeps scanner desktop default behavior local; callers opt-in explicitly.
    /// </summary>
    public class ServerBarcodeApiService
    {
        /// <summary>High connection limit so parallel per-page barcode HTTP posts do not queue on one socket.</summary>
        private static readonly HttpClient Http = new(
            new SocketsHttpHandler
            {
                MaxConnectionsPerServer = 32,
                PooledConnectionIdleTimeout = TimeSpan.FromMinutes(2),
            })
        {
            // Parallel page barcode passes can queue on the Node API; each pageSerial request runs many
            // ZXing crops (log shows ~5s+ server-side). 25s was too low (scanner log: HttpClient.Timeout).
            Timeout = TimeSpan.FromSeconds(120),
        };

        public bool Enabled { get; set; } = AppConfig.UseServerBarcode;
        public string BaseUrl { get; set; } = AppConfig.BarcodeApiBaseUrl;

        public async Task<(string? LinearText, string? QrText, string Diag)> ReadLinearAndQrParallelAsync(
            Bitmap image, CancellationToken ct)
        {
            var req = new DecodeRequest
            {
                ImageBase64 = ToBase64Jpeg(image),
                Mode = "linearQr",
            };
            var resp = await DecodeAsync(req, ct).ConfigureAwait(false);
            return (resp.LinearText, resp.QrText, resp.Diag ?? "");
        }

        public async Task<(string? Result, string Diag, Rectangle? BoundsOnImage)> ReadPageSerialOrFooterWithDiagAsync(
            Bitmap image,
            int pageNumber1Based,
            int barcodeStartPage1Based,
            string? zonesJson,
            CancellationToken ct)
        {
            var req = new DecodeRequest
            {
                ImageBase64 = ToBase64Jpeg(image),
                Mode = "pageSerial",
                PageNumber = pageNumber1Based,
                BarcodeStartPage = barcodeStartPage1Based,
                ZonesJson = zonesJson,
            };

            var resp = await DecodeAsync(req, ct).ConfigureAwait(false);
            return (resp.BarcodeValue, resp.Diag ?? "", null);
        }

        private async Task<DecodeResponse> DecodeAsync(DecodeRequest req, CancellationToken ct)
        {
            var baseUrl = (BaseUrl ?? "").Trim().TrimEnd('/');
            if (string.IsNullOrWhiteSpace(baseUrl))
                return new DecodeResponse { Diag = "server decode disabled: empty URL" };

            var endpoint = $"{baseUrl}/api/barcode/decode";
            try
            {
                var json = JsonConvert.SerializeObject(req);
                using var body = new StringContent(json, Encoding.UTF8, "application/json");
                using var msg = await Http.PostAsync(endpoint, body, ct).ConfigureAwait(false);
                var payload = await msg.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
                if (!msg.IsSuccessStatusCode)
                    return new DecodeResponse { Diag = $"server HTTP {(int)msg.StatusCode}: {payload}" };

                var parsed = JsonConvert.DeserializeObject<DecodeResponse>(payload);
                return parsed ?? new DecodeResponse { Diag = "server decode: empty response" };
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                return new DecodeResponse { Diag = $"server decode error: {ex.Message}" };
            }
        }

        private static string ToBase64Jpeg(Bitmap bmp)
        {
            using var ms = new MemoryStream();
            var jpg = ImageCodecInfo.GetImageEncoders().First(x => x.MimeType == "image/jpeg");
            using var ep = new EncoderParameters(1);
            ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 80L);
            bmp.Save(ms, jpg, ep);
            return Convert.ToBase64String(ms.ToArray());
        }

        private class DecodeRequest
        {
            [JsonProperty("imageBase64")]
            public string ImageBase64 { get; set; } = "";

            [JsonProperty("mode")]
            public string Mode { get; set; } = "linearQr";

            [JsonProperty("pageNumber")]
            public int? PageNumber { get; set; }

            [JsonProperty("barcodeStartPage")]
            public int? BarcodeStartPage { get; set; }

            [JsonProperty("zonesJson")]
            public string? ZonesJson { get; set; }
        }

        private class DecodeResponse
        {
            [JsonProperty("barcodeValue")]
            public string? BarcodeValue { get; set; }

            [JsonProperty("linearText")]
            public string? LinearText { get; set; }

            [JsonProperty("qrText")]
            public string? QrText { get; set; }

            [JsonProperty("diag")]
            public string? Diag { get; set; }
        }
    }
}
