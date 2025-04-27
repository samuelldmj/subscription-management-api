import { Router } from "express";
import { sendReminders, handleReminderTask } from "../Controller/workflow.controller.js";
import { handleTestTask, triggerTestTask } from "../Controller/workflowTest.controller.js";

const workFlowRouter = Router();

workFlowRouter.post("/subscription/reminder", sendReminders);
workFlowRouter.post("/subscription/reminder-task", handleReminderTask);
workFlowRouter.post("/test", handleTestTask);
workFlowRouter.post("/trigger-test", triggerTestTask);

export default workFlowRouter;
