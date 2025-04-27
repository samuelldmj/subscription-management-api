import { Router } from "express";
import { sendReminders, handleReminderTask } from "../Controller/workflow.controller.js";


const workFlowRouter = Router();

workFlowRouter.post("/subscription/reminder", sendReminders);
workFlowRouter.post("/subscription/reminder-task", handleReminderTask);


export default workFlowRouter;
