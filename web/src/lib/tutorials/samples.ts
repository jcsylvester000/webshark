/**
 * Sample data that practice projects start with, so documentation tutorials have something
 * realistic to work on. All data is fictional; the API deliberately has a few documentation
 * gaps (an unauthenticated write, a public admin endpoint) for the security tutorials to find.
 */
import type { ProjectState } from "../project";
import type { OpenApiDoc } from "../openapi/types";

const bearer = [{ bearerAuth: [] as string[] }];
const json = (example: unknown) => ({ "application/json": { example } });

export function sampleSpec(): OpenApiDoc {
  return {
    openapi: "3.1.0",
    info: { title: "Clinic Appointments API", version: "1.0.0", description: "Fictional API used by Slyshark tutorials. Patients, appointments and staff administration." },
    servers: [{ url: "https://api.clinic.example/v1", description: "Production" }],
    tags: [{ name: "Patients" }, { name: "Appointments" }, { name: "Admin" }, { name: "System" }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    paths: {
      "/patients": { get: { tags: ["Patients"], summary: "List patients", operationId: "listPatients", security: bearer, parameters: [{ name: "page", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "A page of patients", content: json([{ id: "p_001", name: "Juan Dela Cruz" }]) }, "401": { description: "Missing or invalid token" } } } },
      "/patients/{patientId}": { get: { tags: ["Patients"], summary: "Get a patient", operationId: "getPatient", security: bearer, parameters: [{ name: "patientId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "The patient", content: json({ id: "p_001", name: "Juan Dela Cruz", birthYear: 1980 }) }, "404": { description: "Not found" } } } },
      "/appointments": { post: { tags: ["Appointments"], summary: "Book an appointment", operationId: "bookAppointment", requestBody: { required: true, content: json({ patientId: "p_001", at: "2026-12-01T09:00:00+08:00" }) }, responses: { "201": { description: "Booked" } } } },
      "/admin/users/{userId}": { delete: { tags: ["Admin"], summary: "Delete a staff user", operationId: "deleteUser", security: [], parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }], responses: { "204": { description: "Deleted" } } } },
      "/health": { get: { tags: ["System"], summary: "Health check", operationId: "health", security: [], responses: { "200": { description: "OK", content: json({ status: "ok" }) } } } },
    },
  } as unknown as OpenApiDoc;
}

/** Adds the sample API docs to a practice project's starting state. */
export const withSampleApi = (s: ProjectState): ProjectState => ({ ...s, docs: { ...s.docs, api: { spec: sampleSpec(), format: "yaml", updatedAt: new Date().toISOString() } } });
