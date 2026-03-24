import swaggerJsdoc from 'swagger-jsdoc';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Scanning & Evaluation System API',
      version: '1.0.0',
      description:
        'REST API serving the desktop scanning application (.NET WinForms) and the web evaluation application (React). Manages exam scanning, booklet lifecycle, on-screen evaluation, marks, page-visit tracking, and MIS reporting.',
      contact: { name: 'API Support', email: 'admin@university.edu' },
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Local development' },
      { url: 'http://api:4000', description: 'Docker container' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from POST /api/auth/login',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Success' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' },
            requestId: { type: 'string', example: 'a1b2c3d4-e5f6-...' },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', example: 'ravi.rajan' },
            password: { type: 'string', format: 'password', example: 'password123' },
            source: {
              type: 'string',
              enum: ['eval', 'scan'],
              default: 'eval',
              description: "Use 'scan' for the desktop scanning app",
            },
          },
        },
        UserInfo: {
          type: 'object',
          properties: {
            userId: { type: 'integer', example: 2 },
            username: { type: 'string', example: 'ravi.rajan' },
            fullName: { type: 'string', example: 'Ravi Rajan' },
            roleName: { type: 'string', example: 'Evaluator' },
            locationId: { type: 'integer', example: 1 },
          },
        },
        ScanSettings: {
          type: 'object',
          properties: {
            location: {
              type: 'object',
              properties: {
                LocationID: { type: 'integer' },
                LocationCode: { type: 'string' },
                LocationName: { type: 'string' },
              },
            },
            exams: { type: 'array', items: { $ref: '#/components/schemas/Exam' } },
            papers: { type: 'array', items: { $ref: '#/components/schemas/Paper' } },
            workstations: { type: 'array', items: { $ref: '#/components/schemas/Workstation' } },
            defaults: {
              type: 'object',
              properties: {
                dpi: { type: 'integer', example: 300 },
                colorMode: { type: 'string', example: 'color' },
                pageSize: { type: 'string', example: 'A4' },
                duplexMode: { type: 'string', example: 'simplex' },
                imageFormat: { type: 'string', example: 'jpeg' },
                jpegQuality: { type: 'integer', example: 85 },
              },
            },
          },
        },
        Exam: {
          type: 'object',
          properties: {
            ExamID: { type: 'integer' },
            ExamCode: { type: 'string' },
            ExamName: { type: 'string' },
            ExamYear: { type: 'integer' },
          },
        },
        Paper: {
          type: 'object',
          properties: {
            PaperID: { type: 'integer' },
            ExamID: { type: 'integer' },
            PaperCode: { type: 'string' },
            PaperName: { type: 'string' },
            TotalPages: { type: 'integer' },
            BookletPageCounts: { type: 'string', example: '12,24,36' },
          },
        },
        Workstation: {
          type: 'object',
          properties: {
            WorkstationID: { type: 'integer' },
            WorkstationCode: { type: 'string' },
            WorkstationName: { type: 'string' },
          },
        },
        SaveBookletRequest: {
          type: 'object',
          required: ['booklet', 'pages'],
          properties: {
            booklet: {
              type: 'object',
              required: ['bookletId', 'examId', 'paperId', 'locationId', 'totalPagesExpected', 'totalPagesScanned'],
              properties: {
                bookletId: { type: 'string', example: '110293000124' },
                examId: { type: 'integer', example: 1 },
                paperId: { type: 'integer', example: 1 },
                locationId: { type: 'integer', example: 1 },
                centreCode: { type: 'string', example: 'LOC001' },
                workstationId: { type: 'integer', example: 1 },
                totalPagesExpected: { type: 'integer', example: 32 },
                totalPagesScanned: { type: 'integer', example: 32 },
                fileHash: { type: 'string', example: 'abc123...' },
                filePath: { type: 'string', example: '/data/scan-output/110293000124' },
                scanDate: { type: 'string', format: 'date', example: '2026-03-03' },
              },
            },
            pages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  pageNumber: { type: 'integer', example: 1 },
                  imagePath: { type: 'string', example: '/data/scan-output/110293000124/110293000124_Page_01.jpg' },
                  pageHash: { type: 'string' },
                  barcodeData: { type: 'string' },
                  validationStatus: { type: 'string', example: 'Valid' },
                  isRoughPage: { type: 'integer', enum: [0, 1] },
                },
              },
            },
          },
        },
        DashboardSummary: {
          type: 'object',
          properties: {
            totalAnswerSheets: { type: 'integer', example: 590 },
            evaluated: { type: 'integer', example: 187 },
            pending: { type: 'integer', example: 391 },
            rejected: { type: 'integer', example: 12 },
          },
        },
        BookletListItem: {
          type: 'object',
          properties: {
            AllocationID: { type: 'integer' },
            BookletID: { type: 'string' },
            AllocationType: { type: 'string' },
            EvaluationStatus: { type: 'string' },
            SessionDate: { type: 'string', format: 'date' },
            StudentName: { type: 'string' },
            ProgramLevel: { type: 'string' },
            Branch: { type: 'string' },
            Year: { type: 'string' },
            Semester: { type: 'string' },
            Subject: { type: 'string' },
            TotalMarks: { type: 'number' },
            MaxMarks: { type: 'number' },
          },
        },
        EvaluationDetail: {
          type: 'object',
          required: ['pageNumber', 'questionNumber', 'marksAwarded', 'maxMarks'],
          properties: {
            pageNumber: { type: 'integer', example: 1 },
            questionNumber: { type: 'string', example: '10' },
            subQuestionCode: { type: 'string', example: 'A' },
            marksAwarded: { type: 'number', example: 3.5 },
            maxMarks: { type: 'number', example: 5 },
            notes: { type: 'string' },
            isFlagged: { type: 'integer', enum: [0, 1] },
            flagReason: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            UserID: { type: 'integer', example: 3 },
            Username: { type: 'string', example: 'ravi.rajan' },
            FullName: { type: 'string', example: 'Ravi Rajan' },
            Email: { type: 'string', format: 'email', example: 'ravi@university.edu' },
            RoleID: { type: 'integer', example: 2 },
            RoleName: { type: 'string', example: 'Evaluator' },
            LocationID: { type: 'integer', example: 1 },
            IsActive: { type: 'integer', enum: [0, 1], example: 1 },
            CreatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateUserRequest: {
          type: 'object',
          required: ['username', 'fullName', 'email', 'password', 'roleId', 'locationId'],
          properties: {
            username:   { type: 'string', example: 'ravi.rajan' },
            fullName:   { type: 'string', example: 'Ravi Rajan' },
            email:      { type: 'string', format: 'email' },
            password:   { type: 'string', format: 'password', minLength: 8 },
            roleId:     { type: 'integer', example: 2 },
            locationId: { type: 'integer', example: 1 },
            mobile:     { type: 'string', example: '9876543210' },
          },
        },
        ScanTemplate: {
          type: 'object',
          properties: {
            TemplateID:    { type: 'integer', example: 1 },
            TemplateName:  { type: 'string', example: 'A4 Color 300dpi Duplex' },
            Dpi:           { type: 'integer', example: 300 },
            ColorMode:     { type: 'string', enum: ['color', 'grayscale', 'blackwhite'], example: 'color' },
            PageSize:      { type: 'string', example: 'A4' },
            DuplexMode:    { type: 'string', enum: ['simplex', 'duplex'], example: 'duplex' },
            ImageFormat:   { type: 'string', enum: ['jpeg', 'png', 'tiff'], example: 'jpeg' },
            JpegQuality:   { type: 'integer', example: 85 },
            DeSkew:        { type: 'integer', enum: [0, 1], example: 1 },
            AutoCrop:      { type: 'integer', enum: [0, 1], example: 1 },
            IsActive:      { type: 'integer', enum: [0, 1], example: 1 },
          },
        },
        PrinterProfile: {
          type: 'object',
          properties: {
            ProfileID:       { type: 'integer', example: 1 },
            ProfileName:     { type: 'string', example: 'Canon DR-G2110' },
            ScannerModel:    { type: 'string', example: 'Canon DR-G2110' },
            DriverType:      { type: 'string', enum: ['WIA', 'TWAIN'], example: 'WIA' },
            DefaultTemplate: { type: 'integer', example: 1 },
            IsActive:        { type: 'integer', enum: [0, 1], example: 1 },
          },
        },
        ScanAdminExam: {
          type: 'object',
          properties: {
            ExamID:   { type: 'integer', example: 1 },
            ExamCode: { type: 'string', example: 'TSPSC-GI-2024' },
            ExamName: { type: 'string', example: 'Group-I Mains 2024' },
            ExamYear: { type: 'integer', example: 2024 },
            IsActive: { type: 'integer', enum: [0, 1], example: 1 },
          },
        },
        ScanAdminPaper: {
          type: 'object',
          properties: {
            PaperID:          { type: 'integer', example: 1 },
            ExamID:           { type: 'integer', example: 1 },
            PaperCode:        { type: 'string', example: 'P1' },
            PaperName:        { type: 'string', example: 'General English' },
            TotalPages:       { type: 'integer', example: 32 },
            BookletPageCounts:{ type: 'string', example: '12,24,36' },
            MaxMarks:         { type: 'number', example: 150 },
          },
        },
        AllocationLotItem: {
          type: 'object',
          properties: {
            BookletID:        { type: 'string', example: '110293000124' },
            ScanDate:         { type: 'string', format: 'date' },
            TotalPagesScanned:{ type: 'integer' },
            AllocationStatus: { type: 'string', example: 'Unallocated' },
            AssignedTo:       { type: 'string', example: 'ravi.rajan' },
          },
        },
        SystemSettings: {
          type: 'object',
          properties: {
            smtpHost:               { type: 'string', example: 'smtp.university.edu' },
            smtpPort:               { type: 'integer', example: 587 },
            smtpUser:               { type: 'string' },
            smtpFrom:               { type: 'string' },
            showBookletDetailsPopup:{ type: 'boolean', example: false },
            monitoringEnabled:      { type: 'boolean', example: true },
            photoCaptureInterval:   { type: 'integer', example: 300, description: 'Seconds between random photo captures' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
    tags: [
      { name: 'Auth',      description: 'Authentication — login, OTP, sessions (evaluators + scanner operators)' },
      { name: 'Scan',      description: 'Desktop scanning app — settings, barcode lookup, booklet save' },
      { name: 'Eval',      description: 'Evaluation app — dashboard, booklet viewer, marks, submission' },
      { name: 'ScanAdmin', description: 'Scan configuration — exams, papers, workstations, templates, printer profiles' },
      { name: 'Admin',     description: 'System administration — users, settings, question papers, email templates' },
      { name: 'HeadEval',  description: 'Head evaluator — allocation lot, assign/unassign, variance review' },
      { name: 'Files',     description: 'Static file serving — scanned page images' },
      { name: 'Health',    description: 'System health check' },
    ],
  },
  apis: [
    join(__dirname, '../modules/**/*.routes.js'),
    join(__dirname, '../index.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
