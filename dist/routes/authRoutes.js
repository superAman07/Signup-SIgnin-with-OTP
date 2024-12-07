"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const twilio_1 = require("twilio");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
const client = new twilio_1.Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const generateOtp = () => ({
    otp: Math.floor(100000 + Math.random() * 900000),
    otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
});
router.post("/signup", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, mobileNumber, role } = req.body;
    if (!/^\+\d{10,15}$/.test(mobileNumber)) {
        res.status(400).json({ error: "Invalid mobile number format" });
        return;
    }
    console.log("Validating role and input parameters");
    const validRoles = ["user", "vendor"];
    if (!validRoles.includes(role)) {
        res.status(400).json({ error: "Invalid role" });
        return;
    }
    console.log("Checking if user already exists for mobile:", mobileNumber);
    const existingUser = yield prisma.user.findUnique({
        where: { mobileNumber },
    });
    if (existingUser) {
        res.status(400).json({ error: "User already exists" });
        return;
    }
    try {
        console.log("Twilio Configuration:");
        console.log("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID);
        console.log("TWILIO_PHONE_NUMBER:", process.env.TWILIO_PHONE_NUMBER);
        console.log("Mobile Number:", mobileNumber);
        const { otp, otpExpiry } = generateOtp();
        console.log("otp is:", otp);
        console.log("otpExpiry in:", otpExpiry);
        const recentOtp = yield prisma.otp.findFirst({
            where: { mobileNumber },
            orderBy: { createdAt: "desc" },
        });
        if (recentOtp && new Date(recentOtp.expiresAt).getTime() > Date.now()) {
            const waitTime = Math.ceil((new Date(recentOtp.expiresAt).getTime() - Date.now()) / 1000);
            res.status(400).json({ error: `OTP already sent. Please wait ${waitTime} seconds.` });
            return;
        }
        yield prisma.otp.deleteMany({ where: { mobileNumber } });
        yield prisma.otp.create({
            data: {
                mobileNumber,
                otp,
                expiresAt: otpExpiry,
            }
        });
        console.log("point 4");
        console.log("Sending OTP to mobileNumber:", mobileNumber);
        if (!process.env.TWILIO_PHONE_NUMBER) {
            throw new Error("Twilio phone number not configured");
        }
        yield client.messages.create({
            body: `Your OTP is ${otp}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: mobileNumber,
        });
        res.status(200).json({ message: "OTP sent successfully" });
    }
    catch (error) {
        console.error("Error sending OTP:", error);
        res.status(500).json({ error: "Error sending OTP", details: error instanceof Error ? error.message : undefined });
    }
}));
router.post("/verifyOtpSignup", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, mobileNumber, role, otp } = req.body;
    console.log("verify 1");
    const otpRecord = yield prisma.otp.findFirst({
        where: { mobileNumber, otp },
        orderBy: { createdAt: "desc" },
    });
    console.log("verify 2");
    if (!otpRecord || new Date(otpRecord.expiresAt).getTime() < Date.now()) {
        res.status(400).json({ error: "OTP expired or invalid" });
        return;
    }
    try {
        console.log("verify 3");
        const newUser = yield prisma.user.create({
            data: { name, mobileNumber, role },
        });
        console.log("verify 4");
        yield prisma.otp.delete({ where: { id: otpRecord.id } });
        const token = jsonwebtoken_1.default.sign({ userId: newUser.id, role: newUser.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
        console.log("Token:", token);
        res.status(201).json({ message: "User created successfully", token });
    }
    catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Error creating user" });
    }
}));
router.post("/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mobileNumber } = req.body;
    console.log("login 1");
    const user = yield prisma.user.findUnique({
        where: { mobileNumber },
    });
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    const { otp, otpExpiry } = generateOtp();
    console.log("otp is:", otp);
    console.log("otpExpiry in:", otpExpiry);
    try {
        console.log('login 2');
        yield prisma.otp.create({
            data: {
                mobileNumber,
                otp,
                expiresAt: otpExpiry,
                user: { connect: { id: user.id } },
            },
        });
        console.log('login 3');
        yield client.messages.create({
            body: `Your OTP is ${otp}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: mobileNumber,
        });
        res.status(200).json({ message: "OTP sent successfully" });
    }
    catch (error) {
        res.status(500).json({ error: "Error sending OTP" });
    }
}));
router.post("/verifyOtpLogin", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { mobileNumber, otp } = req.body;
    console.log("verifyOtpLogin 1");
    const user = yield prisma.user.findUnique({
        where: { mobileNumber },
    });
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    const otpRecord = yield prisma.otp.findFirst({
        where: { mobileNumber, otp },
        orderBy: { createdAt: "desc" },
    });
    console.log('verifyOtpLogin 2');
    if (!otpRecord || otpRecord.expiresAt < new Date()) {
        res.status(400).json({ error: "OTP expired or invalid" });
        return;
    }
    console.log('verifyOtpLogin 3');
    yield prisma.otp.delete({ where: { id: otpRecord.id } });
    console.log('verifyOtpLogin 4');
    const token = jsonwebtoken_1.default.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
    console.log("token: ", token);
    res.status(200).json({ message: "Login successful", token });
}));
exports.default = router;
