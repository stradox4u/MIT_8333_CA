import { reactive, ref } from "vue";
import { ApiError, errorMessage } from "./api";

type Rule<T> = (value: string, values: T) => string;
export function useFields<T extends Record<string, string>>(
  initial: T,
  rules: Partial<Record<keyof T, Rule<T>>>,
) {
  const values = reactive({ ...initial }) as T;
  const errors = reactive<Record<string, string>>({});
  const touched = new Set<keyof T>();
  const formError = ref("");
  function validateField(name: keyof T) {
    errors[String(name)] = rules[name]?.(values[name], values) ?? "";
    return !errors[String(name)];
  }
  function blur(name: keyof T) {
    touched.add(name);
    validateField(name);
  }
  function changed(name: keyof T) {
    if (touched.has(name) || errors[String(name)]) validateField(name);
  }
  function validate() {
    formError.value = "";
    return Object.keys(rules)
      .map((name) => {
        touched.add(name);
        return validateField(name);
      })
      .every(Boolean);
  }
  function showError(error: unknown) {
    if (error instanceof ApiError && error.issues.length) {
      const messages: string[] = [];
      for (const issue of error.issues) {
        const field = issue.path.length === 1 ? String(issue.path[0]) : "";
        if (Object.hasOwn(values, field)) {
          errors[field] = issue.message;
          touched.add(field);
        } else messages.push(issue.message);
      }
      formError.value = messages.join(" ");
    } else formError.value = errorMessage(error);
  }
  return { values, errors, formError, blur, changed, validate, showError };
}

export const emailRule = (value: string) =>
  !value.trim()
    ? "Enter your email address."
    : value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? "Enter a valid email address."
      : "";
export const nameRule = (label: string) => (value: string) =>
  !value.trim()
    ? `Enter your ${label}.`
    : value.trim().length > 100
      ? "Use 100 characters or fewer."
      : "";
export const requiredPassword =
  (label = "password") =>
  (value: string) =>
    !value
      ? `Enter your ${label}.`
      : value.length > 1024
        ? "Use 1,024 characters or fewer."
        : "";
export function newPasswordRule(value: string) {
  if (!value) return "Enter a new password.";
  if ([...value].length < 12) return "Use at least 12 characters.";
  if ([...value].length > 128) return "Use 128 characters or fewer.";
  if (!/\p{Lu}/u.test(value)) return "Include an uppercase letter.";
  if (!/\p{Ll}/u.test(value)) return "Include a lowercase letter.";
  if (!/\p{Nd}/u.test(value)) return "Include a number.";
  return /[^\p{L}\p{N}]/u.test(value) ? "" : "Include a symbol.";
}
