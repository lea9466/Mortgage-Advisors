import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;

export const loginSchema = z.object({
  email: z.email().trim().max(254),
  password: z.string().min(1).max(200),
});

export const signupSchema = z
  .object({
    email: z.email("כתובת אימייל לא תקינה").trim().max(254),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `הסיסמה צריכה להיות באורך ${PASSWORD_MIN_LENGTH} תווים לפחות`)
      .max(200, "הסיסמה ארוכה מדי"),
    passwordConfirm: z.string().max(200),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "הסיסמאות לא זהות",
    path: ["passwordConfirm"],
  });

export const organizationNameSchema = z.object({
  name: z.string().trim().min(2, "השם קצר מדי").max(120, "השם ארוך מדי"),
});

export const mfaCodeSchema = z.object({
  factorId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;
